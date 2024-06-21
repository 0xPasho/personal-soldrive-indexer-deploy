import { run } from "@subsquid/batch-processor";
import { augmentBlock } from "@subsquid/solana-objects";
import { DataSourceBuilder, SolanaRpcClient } from "@subsquid/solana-stream";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import { ApolloServer, gql } from "apollo-server";
import { Like, Not, createConnection, getConnection } from "typeorm";
import { File } from "./model/file.model";
import { User } from "./model/user.model";
import { Subscription } from "./model/subscription.model";
import axios from 'axios';
import FormData from 'form-data';

require('dotenv').config();

// IPFS Client Configuration
const projectId = process.env.IPFS_PROJECT_ID;
const projectSecret = process.env.IPFS_PROJECT_SECRET;
const auth = "Basic " + Buffer.from(projectId + ":" + projectSecret).toString("base64");



async function uploadToIPFS(data: string | Blob) {
    const url = 'https://ipfs.infura.io:5001/api/v0/add';
    const form = new FormData();
    form.append('file', data);

    const headers = {
        authorization: auth,
        ...form.getHeaders()
    };

    try {
        const response = await axios.post(url, form, {
            headers: headers,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });

        console.log('IPFS Hash:', response.data.Hash);
        return response.data.Hash;
    } catch (error) {
        console.error('Error uploading to IPFS:');
    }
}


const FILE_PROGRAM_ID = "4v3uT7y6RHLCJLSwAjWg59tJFhZG1rpa6Q9u6NsZrgUu";
const USER_PROGRAM_ID = "6QnLoMCJV2quAy4GuEsDzH7ubN5vW9NN9zwVNgXNEhYo";
const SUBSCRIBE_ID = "DQozU1hdPhGKPPL3dWonTmfe6w6uydqudrbspmkpfaVW";

const dataSource = new DataSourceBuilder()
    .setRpc(
        process.env.SOLANA_NODE == null
            ? undefined
            : {
                client: new SolanaRpcClient({
                    url: process.env.SOLANA_NODE,
                    rateLimit: 5, // requests per sec
                }),
                strideConcurrency: 1,
            }
    )
    .setBlockRange({ from: 295_283_607 })
    .setFields({
        block: {
            slot: true,
            parentSlot: true,
            timestamp: true,
        },
        transaction: {
            signatures: true,
            err: true,
        },
        instruction: {
            programId: true,
            accounts: true,
            data: true,
            isCommitted: true,
        },
        log: {
            programId: true,
            kind: true,
            message: true,
        },
        balance: {
            pre: true,
            post: true,
        },
        tokenBalance: {
            preMint: true,
            preDecimals: true,
            preOwner: true,
            preAmount: true,
            postMint: true,
            postDecimals: true,
            postOwner: true,
            postAmount: true,
        },
        reward: {
            lamports: true,
            rewardType: true,
        },
    })
    .addInstruction({
        where: {
            programId: [FILE_PROGRAM_ID, USER_PROGRAM_ID, SUBSCRIBE_ID],
        },
        include: {
            transaction: true,
        },
    })
    .addLog({
        where: {
            programId: [FILE_PROGRAM_ID, USER_PROGRAM_ID, SUBSCRIBE_ID],
        },
        include: {
            instruction: false,
        },
    })
    .build();

console.log("Data source built.");

function parseMetadata(metadataString: string | undefined): any {
    console.log("Parsing metadata string:", metadataString);
    if (!metadataString) {
        console.error("Metadata string is undefined");
        return null;
    }
    const metadata: any = {};
    const parts = metadataString
        .replace("Program log: Deserialized metadata: ", "")
        .replace("Deserialized metadata: ", "")
        .replace("UserMetadata { ", "")
        .replace(" }", "")
        .replace("{ ", "")
        .split(", ");

    console.log("Metadata parts:", parts);

    parts.forEach((part, index) => {
        console.log(`Processing part ${index}:`, part);
        const [key, value] = part.split(": ");
        if (!key || !value) {
            console.error(`Invalid part: ${part}`);
            return;
        }
        console.log(`Key: ${key}, Value: ${value}`);
        metadata[key.trim()] = value.replace(/"/g, "").trim();
    });

    console.log("Parsed metadata:", metadata);
    return metadata;
}

const database = new TypeormDatabase();
console.log("Database configured.");

async function isUserAlreadyInserted(walletAddress: string) {
    if (!walletAddress) return false;
    const connection = getConnection();
    const userRepository = connection.getRepository(User);
    const foundUser = await userRepository.findOne({
        where: {
            user_solana: walletAddress,
        },
    });
    return !!foundUser?.id;
}

async function isFileAlreadyInserted({
    cid,
    file_parent_id,
    typ,
    name,
}: {
    cid: string;
    file_parent_id?: string;
    typ?: string;
    name?: string;
}) {
    const connection = getConnection();
    const fileRepository = connection.getRepository(File);

    // folder don't have cid, that's why needs other checks
    if (typ === "folder") {
        const foundFolder = await fileRepository.findOne({
            where: {
                file_parent_id,
                name,
                slot: 0,
                typ: "folder", // important, to avoid folders(they don't have cid)
            },
        });
        return { id: foundFolder?.id };
    }

    const foundFile = await fileRepository.findOne({
        where: {
            cid,
            typ: "file", // important, to avoid folders(they don't have cid)
        },
    });
    return { id: foundFile?.id };
}

run(dataSource, database, async (ctx) => {
    console.log("Entered run function...");

    let blocks = ctx.blocks.map(augmentBlock);
    let fileRecords: File[] = [];
    let userRecords: User[] = [];
    let subscriptions: Subscription[] = [];


    console.log(`Fetched ${blocks.length} blocks`);
    for (let block of blocks) {
        console.log(`Processing block ${block.header.slot}...`);
        console.log("Block structure:", JSON.stringify(block, null, 2)); // Log the structure of each block

        if (block.logs.length === 0) {
            console.log(`Block ${block.header.slot} has no logs.`);
        } else {
            console.log(`Block ${block.header.slot} has ${block.logs.length} logs.`);
        }

        for (let log of block.logs) {
            console.log(`Processing log from program ID ${log.programId}...`);
            console.log("Log structure:", JSON.stringify(log, null, 2)); // Log the structure of each log

            const metadata = parseMetadata(log.message);
            if (metadata) {
                console.log("Metadata parsed:", metadata);

                if (log.programId === FILE_PROGRAM_ID) {
                    const fileAlreadyCreated = await isFileAlreadyInserted(metadata);
                    if (!fileAlreadyCreated) {
                        // if (metadata.file_id && metadata.name && metadata.weight !== undefined && metadata.typ) {
                        const file = new File();
                        file.slot = block.header.slot;
                        file.timestamp = new Date(block.header.timestamp * 1000);
                        Object.assign(file, metadata);
                        fileRecords.push(file);
                    } else {
                    }
                    // } else {
                    //     console.log('Incomplete File metadata, skipping record:', metadata);
                    // }
                } else if (log.programId === USER_PROGRAM_ID) {
                    if (metadata.user_solana && metadata.did_public_address) {
                        const userAlreadyCreated = await isUserAlreadyInserted(metadata.did_public_address);
                        if (!userAlreadyCreated) {
                            // Upload user data to IPFS
                            const userData = {
                                did_public_address: metadata.did_public_address,
                            };
                            console.log('### INSERTING IPFS hash:');


                            try {
                                const ipfsHash= await  uploadToIPFS(JSON.stringify(userData));
                                console.log('IPFS hash:', ipfsHash);

                                const user = new User();
                                user.user_solana = metadata.user_solana;
                                user.slot = block.header.slot;
                                user.did_public_address = metadata.did_public_address;
                                user.ipfs_hash = ipfsHash;
                                userRecords.push(user);
                            } catch (error) {
                                console.error('Error uploading to IPFS:', error);
                                const user = new User();
                                user.user_solana = metadata.user_solana;
                                user.slot = block.header.slot;
                                user.did_public_address = metadata.did_public_address;
                                user.ipfs_hash = 'Error';
                            }
                        }
                    } else {
                        console.log("Incomplete User metadata, skipping record:", metadata);
                    }
                } else if (log.programId === SUBSCRIBE_ID) {

                    if (metadata.Receiver === '6aCLHeb1RS5t1LXNLnvFwP5F4B44ygaUv5PAsE7QEQ57') {
                        // TODO CHECK: CORRECT AMOUNT and correct TOKEN, here we are only checking that we received the token
                        const suscription = new Subscription();
                        suscription.user = metadata.Depositor;
                        suscription.timestamp = new Date(metadata.Timestamp * 1000);
                        subscriptions.push(suscription);
                    }

                }

            } else {
                console.log("No metadata found in log.");
            }
        }
    }

    console.log("Inserting metadata into the database...");

    console.log("File Records:", fileRecords);
    console.log("User Records:", userRecords);
    console.log("subscriptions Records:", subscriptions);


    if (fileRecords.length > 0) {
        await ctx.store.insert(fileRecords);
    }
    if (userRecords.length > 0) {
        await ctx.store.insert(userRecords);
    }

    if (subscriptions.length > 0) {
        await ctx.store.insert(subscriptions);
    }

    console.log("Data processing completed.");
});

console.log("After calling run function...");
console.log("Script execution finished.");

const typeDefs = gql`
  type File {
    id: ID!
    slot: Int!
    timestamp: String!
    file_id: String
    name: String
    weight: Int
    file_parent_id: String
    cid: String
    typ: String
    from: String
    to: String
  }

  type User {
    id: ID!
    user_solana: String!
    did_public_address: String!
    ipfs_hash: String
  }

  type UserSubscription {
    id: ID!
    timestamp: Int!
  }

  type MutationResult {
    result: Boolean
  }

  type Query {
    getAllFiles: [File]
    getFile(file_id: String!): File
    getAllUsers: [User]
    getUser(user_solana: String!): User
    getUserSubscriptionByWallet(walletAddress: String!): UserSubscription
    getFileByCid(cid: String!): File
    getFilesByFromAndTo(from: String, to: String): [File]
    searchUsernames(query: String!, limit: Int): [User]
  }

  type Mutation {
    manualSyncFileCreation(
      file_id: String
      name: String
      weight: Int
      file_parent_id: String
      cid: String
      from: String
      to: String
      typ: String
    ): MutationResult
    manualSyncUserCreation(
      user_solana: String
      did_public_address: String
    ): MutationResult
  }
`;

const resolvers = {
    Query: {
        getAllFiles: async () => {
            const connection = getConnection();
            const fileRepository = connection.getRepository(File);
            return await fileRepository.find();
        },
        getFile: async (_: any, { file_id }: { file_id: string }) => {
            const connection = getConnection();
            const fileRepository = connection.getRepository(File);
            return await fileRepository.findOne({ where: { file_id } });
        },
        getAllUsers: async () => {
            const connection = getConnection();
            const userRepository = connection.getRepository(User);
            return await userRepository.find();
        },
        getUser: async (_: any, { user_solana }: { user_solana: string }) => {
            const connection = getConnection();
            const userRepository = connection.getRepository(User);
            return await userRepository.findOne({ where: { user_solana } });
        },
        getUserSubscriptionByWallet: async (
            _: any,
            { walletAddress }: { walletAddress: string }
        ) => {
            return {
                id: "test-id",
                timestamp: 199,
            };
        },
        getFileByCid: async (_: any, { cid }: { cid: string }) => {
            const connection = getConnection();
            const fileRepository = connection.getRepository(File);
            return await fileRepository.findOne({ where: { cid } });
        },
        getFilesByFromAndTo: async (
            _: any,
            { from, to }: { from?: string; to?: string }
        ) => {
            const connection = getConnection();
            const fileRepository = connection.getRepository(File);
            let whereCondition = {};
            if (from && to) {
                whereCondition = { from, to };
            } else if (from) {
                whereCondition = { from };
            } else {
                // all registry with "to" address
                // will have the same address as from
                // when the file is uploading to its own drive
                whereCondition = { to, from: Not(to) };
            }
            return await fileRepository.find({ where: whereCondition });
        },
        searchUsernames: async (_: any, { query, limit }: { query: string; limit?: number }) => {
            const connection = getConnection();
            const userRepository = connection.getRepository(User);
            return await userRepository.find({
                where: { did_public_address: Like(`%${query}%`) },
                take: limit || 5,
            });
        },
    },
    Mutation: {
        manualSyncFileCreation: async (
            _: any,
            {
                file_id,
                name,
                weight,
                file_parent_id,
                cid,
                from,
                to,
                typ,
            }: {
                file_id?: string;
                name?: string;
                weight?: number;
                file_parent_id?: string;
                cid?: string;
                typ?: string;
                from?: string;
                to?: string;
            }
        ) => {
            const connection = getConnection();
            const fileRepository = connection.getRepository(File);
            await fileRepository.insert({
                file_id,
                name,
                weight,
                file_parent_id,
                cid,
                from,
                to,
                typ,
                slot: 0,
                timestamp: new Date(),
            });
            return { result: true };
        },
        manualSyncUserCreation: async (
            _: any,
            {
                user_solana,
                did_public_address,
            }: {
                user_solana?: string;
                did_public_address?: string;
            }
        ) => {
            const connection = getConnection();
            const userRepository = connection.getRepository(User);

            // Upload user data to IPFS
            const userData = {
                did_public_address,
            };
            const { path: ipfsHash } = await uploadToIPFS(JSON.stringify(userData));

            await userRepository.insert({
                user_solana,
                did_public_address,
                ipfs_hash: ipfsHash,
                slot: 0,
            });
            return { result: true };
        },
    },
};

async function startServer() {
    await createConnection({
        type: "postgres",
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT || "5432", 10),
        username: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        entities: [File, User, Subscription],
        synchronize: true,
        logging: false,
    });

    const server = new ApolloServer({ typeDefs, resolvers });
    server.listen().then(({ url }) => {
        console.log(`🚀 Server ready at ${url}`);
    });
}

startServer().catch((error) => console.error("Error starting server:", error));
