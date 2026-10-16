import "dotenv/config";
import {privateKeyToAccount} from "viem/accounts";
import {createPublicClient, http,formatUnits} from "viem";
import {baseSepolia} from "viem/chains";
const key = process.env.BUYER_PRIVATE_KEY;
if (!key || !/^0x[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error("BUYER_PRIVATE_KEY is missing or invalid in .env.");
}
const account = privateKeyToAccount(key);
const client = createPublicClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
});

const usdcAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const balance = await client.readContract({
    address: usdcAddress,
    abi:[{
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{type: "address", name: "account"}],
        outputs: [{type: "uint256",name: ""}],
    }],
    functionName: "balanceOf",
    args: [account.address],
});

console.log(`Buyer account: ${account.address}`);
console.log(`Buyer testnet USDC balance: ${formatUnits(balance, 6)} USDC`);
