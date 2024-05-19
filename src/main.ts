import { run } from '@subsquid/batch-processor';
import { augmentBlock } from '@subsquid/solana-objects';
import { DataSourceBuilder, SolanaRpcClient } from '@subsquid/solana-stream';
import { TypeormDatabase } from '@subsquid/typeorm-store';
import { ApolloServer, gql } from 'apollo-server';
import { Exchange } from './model';
import { createConnection, getConnection } from 'typeorm';

const PROGRAM_ID = '4v3uT7y6RHLCJLSwAjWg59tJFhZG1rpa6Q9u6NsZrgUu';

// First, we create a DataSource component that defines where to get the data and what data to get
const dataSource = new DataSourceBuilder()
    // Provide Subsquid Network Gateway URL (optional)
    // .setGateway('https://v2.archive.subsquid.io/network/solana-mainnet')
    // Set the RPC endpoint
    .setRpc(process.env.SOLANA_NODE == null ? undefined : {
        client: new SolanaRpcClient({
            url: process.env.SOLANA_NODE,
            rateLimit: 100 // requests per sec
        }),
        strideConcurrency: 1
    })
    // Specify the range of blocks to fetch using the slot number
    .setBlockRange({ from: 280_243_678 })
    // Select specific fields from the blocks
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
    // Add instruction selection criteria
    .addInstruction({
        where: {
            programId: [PROGRAM_ID]
        },
        include: {
            transaction: true
        }
    })
    // Add log selection criteria
    .addLog({
        where: {
            programId: [PROGRAM_ID]
        },
        include: {
            instruction: false
        }
    })
    .build();

console.log('Data source built.');

// Function to parse metadata from log messages
function parseMetadata(logMessages: string[]): Partial<Exchange> | null {
    console.log("Log Messages:", logMessages);  // Log all messages to inspect their format
    const metadata: Partial<Exchange> = {};
    const metaRegex = /^Deserialized metadata: TokenMetadata \{ (.*) \}$/;
    for (const log of logMessages) {
        const match = log.match(metaRegex);
        if (match) {
            const parts = match[1].split(", ");
            parts.forEach(part => {
                const [key, value] = part.split(": ");
                (metadata as any)[key.trim()] = value.replace(/"/g, '');
            });
            return metadata;
        }
    }
    return null;  // Return null if no metadata is found
}

// Create the database instance
const database = new TypeormDatabase();
console.log('Database configured.');

// Start data processing
run(dataSource, database, async ctx => {
    console.log('Entered run function...');

    // Use augmentBlock to enrich block items
    let blocks = ctx.blocks.map(augmentBlock);
    let metadataRecords: Exchange[] = [];

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

            if (log.programId === PROGRAM_ID) {
                const metadata = parseMetadata(log.message.split('\n'));
                if (metadata) {
                    console.log('Metadata parsed:', metadata);
                    const exchange = new Exchange();
                    exchange.slot = block.header.slot;
                    exchange.tx = log.transaction?.signatures[0] || '';
                    exchange.timestamp = new Date(block.header.timestamp * 1000);
                    Object.assign(exchange, metadata);
                    metadataRecords.push(exchange);
                } else {
                    console.log('No metadata found in log.');
                }
            } else {
                console.log('Log does not match program ID');
            }
        }
    }

    console.log('Inserting metadata into the database...');

    console.log(metadataRecords);

    await ctx.store.insert(metadataRecords);
    console.log('Data processing completed.');
});

console.log('After calling run function...');
console.log('Script execution finished.');

// GraphQL schema definition
const typeDefs = gql`
  type Exchange {
    id: ID!
    slot: Int!
    tx: String!
    timestamp: String!
    file_id: String
    name: String
    weight: Int
    file_parent_id: String
    cid: String
    typ: String
  }

  type Query {
    getAllExchanges: [Exchange]
    getExchange(id: ID!): Exchange
  }
`;

// Resolvers
const resolvers = {
    Query: {
        getAllExchanges: async () => {
            const connection = getConnection();
            const exchangeRepository = connection.getRepository(Exchange);
            return await exchangeRepository.find();
        },
        getExchange: async (_: any, { id }: { id: string }) => {
            const connection = getConnection();
            const exchangeRepository = connection.getRepository(Exchange);
            return await exchangeRepository.findOne({ where: { id } });
        },
    },
};

// Initialize GraphQL server
async function startServer() {
    // Establish the TypeORM connection
    await createConnection({
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        entities: [Exchange],
        synchronize: true,
        logging: false,
    });

    const server = new ApolloServer({ typeDefs, resolvers });
    server.listen().then(({ url }) => {
        console.log(`🚀 Server ready at ${url}`);
    });
}

startServer().catch(error => console.error('Error starting server:', error));
