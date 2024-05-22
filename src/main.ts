import { run } from '@subsquid/batch-processor';
import { augmentBlock } from '@subsquid/solana-objects';
import { DataSourceBuilder, SolanaRpcClient } from '@subsquid/solana-stream';
import { TypeormDatabase } from '@subsquid/typeorm-store';
import { ApolloServer, gql } from 'apollo-server';
import { createConnection, getConnection } from 'typeorm';
import { File } from './model/file.model';
import { User } from './model/user.model';

const FILE_PROGRAM_ID = '4v3uT7y6RHLCJLSwAjWg59tJFhZG1rpa6Q9u6NsZrgUu';
const USER_PROGRAM_ID = '6QnLoMCJV2quAy4GuEsDzH7ubN5vW9NN9zwVNgXNEhYo';


const dataSource = new DataSourceBuilder()
    .setRpc(process.env.SOLANA_NODE == null ? undefined : {
        client: new SolanaRpcClient({
            url: process.env.SOLANA_NODE,
            rateLimit: 10 // requests per sec
        }),
        strideConcurrency: 1
    })
    .setBlockRange({ from: 278_927_805 })
    .setFields({
        block: {
            slot: true,
            parentSlot: true,
            timestamp: true
        },
        transaction: {
            signatures: true,
            err: true
        },
        instruction: {
            programId: true,
            accounts: true,
            data: true,
            isCommitted: true
        },
        log: {
            programId: true,
            kind: true,
            message: true
        },
        balance: {
            pre: true,
            post: true
        },
        tokenBalance: {
            preMint: true,
            preDecimals: true,
            preOwner: true,
            preAmount: true,
            postMint: true,
            postDecimals: true,
            postOwner: true,
            postAmount: true
        },
        reward: {
            lamports: true,
            rewardType: true
        }
    })
    .addInstruction({
        where: {
            programId: [FILE_PROGRAM_ID, USER_PROGRAM_ID]
        },
        include: {
            transaction: true
        }
    })
    .addLog({
        where: {
            programId: [FILE_PROGRAM_ID, USER_PROGRAM_ID]
        },
        include: {
            instruction: false
        }
    })
    .build();

console.log('Data source built.');

function parseMetadata(metadataString: string | undefined): any {
    console.log('Parsing metadata string:', metadataString);
    if (!metadataString) {
        console.error('Metadata string is undefined');
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
    
    console.log('Metadata parts:', parts);

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

    console.log('Parsed metadata:', metadata);
    return metadata;
}

const database = new TypeormDatabase();
console.log('Database configured.');

run(dataSource, database, async ctx => {
    console.log('Entered run function...');

    let blocks = ctx.blocks.map(augmentBlock);
    let fileRecords: File[] = [];
    let userRecords: User[] = [];

    console.log(`Fetched ${blocks.length} blocks`);
    for (let block of blocks) {
        console.log(`Processing block ${block.header.slot}...`);
        console.log('Block structure:', JSON.stringify(block, null, 2)); // Log the structure of each block

        if (block.logs.length === 0) {
            console.log(`Block ${block.header.slot} has no logs.`);
        } else {
            console.log(`Block ${block.header.slot} has ${block.logs.length} logs.`);
        }

        for (let log of block.logs) {
            console.log(`Processing log from program ID ${log.programId}...`);
            console.log('Log structure:', JSON.stringify(log, null, 2)); // Log the structure of each log

            const metadata = parseMetadata(log.message);
            if (metadata) {
                console.log('Metadata parsed:', metadata);

                if (log.programId === FILE_PROGRAM_ID) {
                    // if (metadata.file_id && metadata.name && metadata.weight !== undefined && metadata.typ) {
                        const file = new File();
                        file.slot = block.header.slot;
                        file.timestamp = new Date(block.header.timestamp * 1000);
                        Object.assign(file, metadata);
                        fileRecords.push(file);
                    // } else {
                    //     console.log('Incomplete File metadata, skipping record:', metadata);
                    // }
                } else if (log.programId === USER_PROGRAM_ID) {
                    if (metadata.user_solana && metadata.did_public_address) {
                        const user = new User();
                        user.user_solana = metadata.user_solana;
                        user.slot =block.header.slot;
                        user.did_public_address = metadata.did_public_address;
                        userRecords.push(user);
                    } else {
                        console.log('Incomplete User metadata, skipping record:', metadata);
                    }
                }
            } else {
                console.log('No metadata found in log.');
            }
        }
    }

    console.log('Inserting metadata into the database...');

    console.log('File Records:', fileRecords);
    console.log('User Records:', userRecords);

    if (fileRecords.length > 0) {
        await ctx.store.insert(fileRecords);
    }
    if (userRecords.length > 0) {
        await ctx.store.insert(userRecords);
    }
    
    console.log('Data processing completed.');
});

console.log('After calling run function...');
console.log('Script execution finished.');

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
  }

  type Query {
    getAllFiles: [File]
    getFile(file_id: String!): File
    getAllUsers: [User]
    getUser(user_solana: String!): User
    getFileByCid(cid: String!): File
    getFilesByFromAndTo(from: String!, to: String): [File]
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
      getFileByCid: async (_: any, { cid }: { cid: string }) => {
        const connection = getConnection();
        const fileRepository = connection.getRepository(File);
        return await fileRepository.findOne({ where: { cid } });
      },
      getFilesByFromAndTo: async (_: any, { from, to }: { from: string, to: string }) => {
        const connection = getConnection();
        const fileRepository = connection.getRepository(File);
        const whereCondition = to ? { from, to } : { from };
        return await fileRepository.find({ where: whereCondition });
      },
    },
  };
  

async function startServer() {
    await createConnection({
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        entities: [File, User],
        synchronize: true,
        logging: false,
    });

    const server = new ApolloServer({ typeDefs, resolvers });
    server.listen().then(({ url }) => {
        console.log(`🚀 Server ready at ${url}`);
    });
}

startServer().catch(error => console.error('Error starting server:', error));
