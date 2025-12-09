import { execSync } from "child_process";
import * as fs from "fs";
import { NetworkType } from "../../src";

// Test coin with private TreasuryCap (for mainnet - only owner can mint)
const testCoinSourcePrivate = (symbol: string, name: string) => `
#[allow(deprecated_usage)]
module test_coin::coin {
    use sui::coin::{Self, TreasuryCap};

    public struct COIN has drop {}

    fun init(witness: COIN, ctx: &mut TxContext) {
        let (treasury, metadata) = coin::create_currency(
            witness,
            9,
            b"${symbol}",
            b"${name}",
            b"Test coin for launchpad E2E testing",
            option::none(),
            ctx
        );

        // Transfer treasury and metadata to sender WITHOUT freezing (required for launchpad)
        transfer::public_transfer(treasury, ctx.sender());
        transfer::public_transfer(metadata, ctx.sender());
    }

    public fun mint(
        treasury_cap: &mut TreasuryCap<COIN>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let coin = coin::mint(treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient)
    }
}
`;


// Test coin with shared TreasuryCap (for devnet/testnet - anyone can mint for testing)
const testCoinSourceShared = (symbol: string, name: string) => `
#[allow(deprecated_usage)]
module test_coin::coin {
    use sui::coin::{Self, TreasuryCap};

    public struct COIN has drop {}

    fun init(witness: COIN, ctx: &mut TxContext) {
        let (treasury, metadata) = coin::create_currency(
            witness,
            9,
            b"${symbol}",
            b"${name}",
            b"Test coin for launchpad E2E testing",
            option::none(),
            ctx
        );

        // Share treasury cap so anyone can mint (for testing on devnet/testnet)
        transfer::public_share_object(treasury);
        transfer::public_transfer(metadata, ctx.sender());
    }

    public fun mint(
        treasury_cap: &mut TreasuryCap<COIN>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let coin = coin::mint(treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient)
    }
}
`;

export const getTestCoinSource = (symbol: string, name: string, network: NetworkType, forcePrivate: boolean = false) => {
    // On mainnet, always use private treasury cap (only owner can mint)
    // On devnet/testnet, use shared by default unless forcePrivate is true
    if (network === "mainnet" || forcePrivate) {
      return testCoinSourcePrivate(symbol, name);
    }
    return testCoinSourceShared(symbol, name);
  };

export async function createTestCoin(
    name: string,
    symbol: string,
    network: NetworkType = "devnet",
    isSharedTreasuryCap: boolean = false,
  ): Promise<{
    packageId: string;
    type: string;
    treasuryCap: string;
    metadata: string;
    isSharedTreasuryCap: boolean;
  }> {
    if(network === "mainnet") {
      isSharedTreasuryCap = false;
    }
    console.log(`\n📦 Publishing ${name} test coin (network: ${network}, shared treasury: ${isSharedTreasuryCap})...`);
  
    const tmpDir = `/tmp/test_coin_${symbol.toLowerCase()}`;
    execSync(`rm -rf ${tmpDir} && mkdir -p ${tmpDir}/sources`, {
      encoding: "utf8",
    });
  
    fs.writeFileSync(
      `${tmpDir}/Move.toml`,
      `
  [package]
  name = "test_coin"
  edition = "2024.beta"
  
  [dependencies]
  Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/testnet" }
  
  [addresses]
  test_coin = "0x0"
  `,
    );
  
    const forcePrivate = !isSharedTreasuryCap;
    fs.writeFileSync(`${tmpDir}/sources/coin.move`, getTestCoinSource(symbol, name, network, forcePrivate));
  
    console.log("   Building...");
    execSync(`cd ${tmpDir} && sui move build 2>&1 | grep -v "warning"`, {
      encoding: "utf8",
    });
  
    console.log("   Publishing...");
    const result = execSync(
      `cd ${tmpDir} && sui client publish --gas-budget 100000000 --json`,
      { encoding: "utf8" },
    );
    const parsed = JSON.parse(result);
  
    if (parsed.effects.status.status !== "success") {
      throw new Error(
        `Failed to publish ${name}: ${parsed.effects.status.error}`,
      );
    }
  
    const published = parsed.objectChanges.find(
      (c: any) => c.type === "published",
    );
    const packageId = published.packageId;
  
    const created = parsed.objectChanges.filter((c: any) => c.type === "created");
    const treasuryCap = created.find((c: any) =>
      c.objectType.includes("TreasuryCap"),
    );
    const metadata = created.find((c: any) =>
      c.objectType.includes("CoinMetadata"),
    );
  
    const coinType = `${packageId}::coin::COIN`;
  
    console.log(`   ✅ Published!`);
    console.log(`      Package: ${packageId}`);
    console.log(`      Type: ${coinType}`);
    console.log(`      TreasuryCap: ${treasuryCap.objectId}`);
    console.log(`      Metadata: ${metadata.objectId}`);
    console.log(`      Shared TreasuryCap: ${isSharedTreasuryCap}`);
  
    return {
      packageId,
      type: coinType,
      treasuryCap: treasuryCap.objectId,
      metadata: metadata.objectId,
      isSharedTreasuryCap,
    };
  }