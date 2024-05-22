(async () => {
    const fetch = await import('node-fetch').then(module => module.default);

    async function getBlockDetails(slot, url) {
        const headers = { "Content-Type": "application/json" };
        const payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getBlock",
            "params": [slot, { "commitment": "finalized", "maxSupportedTransactionVersion": 0 }]
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const responseData = await response.json();
                console.log("Response JSON:", responseData); // Debugging line
                return responseData;
            } else {
                console.error("Request failed with status code:", response.status);
                return null;
            }
        } catch (error) {
            console.error("Request failed:", error);
            return null;
        }
    }

    const slot = 290636096;

    const devnetUrl = "https://api.devnet.solana.com";
    const mainnetUrl = "https://api.mainnet-beta.solana.com";

    console.log("Fetching block details from Devnet...");
    const blockDetailsDevnet = await getBlockDetails(slot, devnetUrl);

    if (blockDetailsDevnet && blockDetailsDevnet.result) {
        const blockHeight = blockDetailsDevnet.result.blockHeight;
        console.log("Devnet Block Height:", blockHeight);
    } else {
        console.log("Unable to fetch block details from Devnet.");
    }

    console.log("\nFetching block details from Mainnet...");
    const blockDetailsMainnet = await getBlockDetails(slot, mainnetUrl);

    if (blockDetailsMainnet && blockDetailsMainnet.result) {
        const blockHeight = blockDetailsMainnet.result.blockHeight;
        console.log("Mainnet Block Height:", blockHeight);
    } else {
        console.log("Unable to fetch block details from Mainnet.");
    }
})();
