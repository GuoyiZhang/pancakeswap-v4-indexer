/*
 * Initialize event handlers for PancakeSwap v4 pools
 */
import { PoolManager, BigDecimal } from "generated";
import { getChainConfig } from "../utils/chains";
import { sqrtPriceX96ToTokenPrices } from "../utils/pricing";
import { getTokenMetadata } from "../utils/tokenMetadata";
import { findNativePerToken } from "../utils/pricing";

PoolManager.Initialize.handler(async ({ event, context }) => {
  console.log("🚀 Processing Initialize event:", {
    id: event.params.id,
    currency0: event.params.currency0,
    currency1: event.params.currency1,
    hooks: event.params.hooks,
    fee: event.params.fee,
    parameters: event.params.parameters,
    sqrtPriceX96: event.params.sqrtPriceX96?.toString(),
    tick: event.params.tick?.toString()
  });

  // Get chain config for whitelist tokens and pools to skip
  const chainConfig = getChainConfig(Number(event.chainId));

  // Check if this pool should be skipped (similar to subgraph implementation)
  if (chainConfig.poolsToSkip.includes(event.params.id)) {
    return;
  }

  // Define isHookedPool at the start
  const isHookedPool =
    event.params.hooks !== "0x0000000000000000000000000000000000000000";

  let poolManager = await context.PoolManager.get(
    `${event.chainId}_${event.srcAddress}`
  );
  if (!poolManager) {
    poolManager = {
      id: `${event.chainId}_${event.srcAddress}`,
      chainId: BigInt(event.chainId),
      poolCount: 1n,
      txCount: 0n,
      totalVolumeUSD: new BigDecimal(0),
      totalVolumeETH: new BigDecimal(0),
      totalFeesUSD: new BigDecimal(0),
      totalFeesETH: new BigDecimal(0),
      untrackedVolumeUSD: new BigDecimal(0),
      totalValueLockedUSD: new BigDecimal(0),
      totalValueLockedETH: new BigDecimal(0),
      totalValueLockedUSDUntracked: new BigDecimal(0),
      totalValueLockedETHUntracked: new BigDecimal(0),
      owner: event.srcAddress,
      numberOfSwaps: 0n,
      hookedPools: 0n,
      hookedSwaps: 0n,
    };
    await context.Bundle.set({
      id: event.chainId.toString(),
      ethPriceUSD: new BigDecimal("0"),
    });
  } else {
    poolManager = {
      ...poolManager,
      poolCount: poolManager.poolCount + 1n,
    };
  }

  // Update or create HookStats if this is a hooked pool
  if (isHookedPool) {
    poolManager = {
      ...poolManager,
      hookedPools: poolManager.hookedPools + 1n,
    };

    const hookStatsId = `${event.chainId}_${event.params.hooks}`;
    let hookStats = await context.HookStats.get(hookStatsId);

    if (!hookStats) {
      hookStats = {
        id: hookStatsId,
        chainId: BigInt(event.chainId),
        numberOfPools: 0n,
        numberOfSwaps: 0n,
        firstPoolCreatedAt: BigInt(event.block.timestamp),
        totalValueLockedUSD: new BigDecimal("0"),
        totalVolumeUSD: new BigDecimal("0"),
        untrackedVolumeUSD: new BigDecimal("0"),
        totalFeesUSD: new BigDecimal("0"),
      };
    }

    hookStats = {
      ...hookStats,
      numberOfPools: hookStats.numberOfPools + 1n,
    };

    await context.HookStats.set(hookStats);
  }

  // Create or get token0
  const token0Id = `${event.chainId}_${event.params.currency0.toLowerCase()}`;
  let token0 = await context.Token.get(token0Id);
  if (!token0) {
    try {
      const metadata = await getTokenMetadata(
        event.params.currency0,
        Number(event.chainId)
      );
      token0 = {
        id: token0Id,
        chainId: BigInt(event.chainId),
        symbol: metadata.symbol,
        name: metadata.name,
        decimals: BigInt(metadata.decimals),
        totalSupply: 0n,
        volume: new BigDecimal("0"),
        volumeUSD: new BigDecimal("0"),
        untrackedVolumeUSD: new BigDecimal("0"),
        feesUSD: new BigDecimal("0"),
        txCount: 0n,
        poolCount: 1n,
        totalValueLocked: new BigDecimal("0"),
        totalValueLockedUSD: new BigDecimal("0"),
        totalValueLockedUSDUntracked: new BigDecimal("0"),
        derivedETH: new BigDecimal("0"),
        whitelistPools: [], // Initialize empty array
      };
    } catch (error) {
      console.error("❌ Failed to get metadata for token0:", event.params.currency0, error);
      throw error; // Re-throw to be caught by the handler
    }
  } else {
    token0 = {
      ...token0,
      poolCount: token0.poolCount + 1n,
    };
  }

  // Create or get token1
  const token1Id = `${event.chainId}_${event.params.currency1.toLowerCase()}`;
  let token1 = await context.Token.get(token1Id);
  if (!token1) {
    try {
      const metadata = await getTokenMetadata(
        event.params.currency1,
        Number(event.chainId)
      );
      token1 = {
        id: token1Id,
        chainId: BigInt(event.chainId),
        symbol: metadata.symbol,
        name: metadata.name,
        decimals: BigInt(metadata.decimals),
        totalSupply: 0n,
        volume: new BigDecimal("0"),
        volumeUSD: new BigDecimal("0"),
        untrackedVolumeUSD: new BigDecimal("0"),
        feesUSD: new BigDecimal("0"),
        txCount: 0n,
        poolCount: 1n,
        totalValueLocked: new BigDecimal("0"),
        totalValueLockedUSD: new BigDecimal("0"),
        totalValueLockedUSDUntracked: new BigDecimal("0"),
        derivedETH: new BigDecimal("0"),
        whitelistPools: [], // Initialize empty array
      };
    } catch (error) {
      console.error("❌ Failed to get metadata for token1:", event.params.currency1, error);
      throw error; // Re-throw to be caught by the handler
    }
  } else {
    token1 = {
      ...token1,
      poolCount: token1.poolCount + 1n,
    };
  }

  // Update whitelist pools first
  if (
    chainConfig.whitelistTokens.includes(event.params.currency0.toLowerCase())
  ) {
    token1 = {
      ...token1,
      whitelistPools: [
        ...token1.whitelistPools,
        `${event.chainId}_${event.params.id}`,
      ],
    };
  }

  if (
    chainConfig.whitelistTokens.includes(event.params.currency1.toLowerCase())
  ) {
    token0 = {
      ...token0,
      whitelistPools: [
        ...token0.whitelistPools,
        `${event.chainId}_${event.params.id}`,
      ],
    };
  }

  // Calculate initial prices
  const prices = sqrtPriceX96ToTokenPrices(
    event.params.sqrtPriceX96,
    token0,
    token1,
    chainConfig.nativeTokenDetails
  );

  const feeBps = Number(event.params.fee) / 10000; // Convert to percentage (fee is in bps)
  const poolName = `${token0.symbol} / ${token1.symbol} - ${feeBps}%`;

  // PancakeSwap v4没有tickSpacing字段，使用固定默认值
  const tickSpacing = BigInt(60); // 默认值60

  // Create new pool with prices
  const pool = {
    id: `${event.chainId}_${event.params.id}`,
    chainId: BigInt(event.chainId),
    name: poolName,
    createdAtTimestamp: BigInt(event.block.timestamp),
    createdAtBlockNumber: BigInt(event.block.number),
    token0: token0Id,
    token1: token1Id,
    feeTier: BigInt(event.params.fee),
    liquidity: 0n,
    sqrtPrice: event.params.sqrtPriceX96,
    token0Price: prices[0],
    token1Price: prices[1],
    tick: event.params.tick,
    tickSpacing: tickSpacing,
    observationIndex: 0n,
    volumeToken0: new BigDecimal(0),
    volumeToken1: new BigDecimal(0),
    volumeUSD: new BigDecimal(0),
    untrackedVolumeUSD: new BigDecimal(0),
    feesUSD: new BigDecimal("0"),
    feesUSDUntracked: new BigDecimal("0"),
    txCount: 0n,
    collectedFeesToken0: new BigDecimal(0),
    collectedFeesToken1: new BigDecimal(0),
    collectedFeesUSD: new BigDecimal(0),
    totalValueLockedToken0: new BigDecimal(0),
    totalValueLockedToken1: new BigDecimal(0),
    totalValueLockedETH: new BigDecimal(0),
    totalValueLockedUSD: new BigDecimal(0),
    totalValueLockedUSDUntracked: new BigDecimal(0),
    liquidityProviderCount: 0n,
    hooks: event.params.hooks,
  };

  // Now update derivedETH values
  token0 = {
    ...token0,
    derivedETH: await findNativePerToken(
      context,
      token0,
      chainConfig.wrappedNativeAddress,
      chainConfig.stablecoinAddresses,
      chainConfig.minimumNativeLocked
    ),
  };

  token1 = {
    ...token1,
    derivedETH: await findNativePerToken(
      context,
      token1,
      chainConfig.wrappedNativeAddress,
      chainConfig.stablecoinAddresses,
      chainConfig.minimumNativeLocked
    ),
  };

  try {
    await context.Pool.set(pool);
    await context.PoolManager.set(poolManager);
    await context.Token.set(token0);
    await context.Token.set(token1);
    console.log("✅ Successfully processed Initialize event for pool:", pool.id);
  } catch (error) {
    console.error("❌ Failed to process Initialize event for pool:", pool.id, error);
    throw error; // Re-throw to be caught by the handler
  }
});
