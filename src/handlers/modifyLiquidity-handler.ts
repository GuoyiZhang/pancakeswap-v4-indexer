/*
 * Liquidity event handlers for Uniswap v4 pools
 */
import { PoolManager } from "generated";
import {
  getAmount0,
  getAmount1,
} from "../utils/liquidityMath/liquidityAmounts";
import { convertTokenToDecimal } from "../utils";
import { createTick } from "../utils/tick";
import { getChainConfig } from "../utils/chains";

PoolManager.ModifyLiquidity.handler(async ({ event, context }) => {
  console.log("🔄 Processing ModifyLiquidity event:", {
    id: event.params.id,
    sender: event.params.sender,
    tickLower: event.params.tickLower?.toString(),
    tickUpper: event.params.tickUpper?.toString(),
    liquidityDelta: event.params.liquidityDelta?.toString(),
    salt: event.params.salt,
    txHash: event.transaction.hash,
    blockNumber: event.block.number?.toString(),
    logIndex: event.logIndex?.toString()
  });

  // Get chain config for pools to skip
  const chainConfig = getChainConfig(Number(event.chainId));

  // Check if this pool should be skipped
  // NOTE: Subgraph only has this check in Initialize handler since skipped pools
  // are never created, but we keep it here for safety in case we switch to
  // getOrThrow APIs in the future and don't want exceptions thrown
  if (chainConfig.poolsToSkip.includes(event.params.id)) {
    return;
  }

  let pool = await context.Pool.get(`${event.chainId}_${event.params.id}`);
  if (!pool) return;
  let token0 = await context.Token.get(pool.token0);
  let token1 = await context.Token.get(pool.token1);
  if (!token0 || !token1) return;
  const bundle = await context.Bundle.get(event.chainId.toString());
  if (!bundle) return;
  const currTick = pool.tick ?? 0n;
  const currSqrtPriceX96 = pool.sqrtPrice ?? 0n;
  // Calculate the token amounts from the liquidity change
  const amount0Raw = getAmount0(
    event.params.tickLower,
    event.params.tickUpper,
    currTick,
    event.params.liquidityDelta,
    currSqrtPriceX96
  );
  const amount1Raw = getAmount1(
    event.params.tickLower,
    event.params.tickUpper,
    currTick,
    event.params.liquidityDelta,
    currSqrtPriceX96
  );
  // Convert to proper decimals
  const amount0 = convertTokenToDecimal(amount0Raw, token0.decimals);
  const amount1 = convertTokenToDecimal(amount1Raw, token1.decimals);

  // Calculate amountUSD based on token prices
  const amountUSD = amount0
    .times(token0.derivedETH)
    .plus(amount1.times(token1.derivedETH))
    .times(bundle.ethPriceUSD);

  // Update pool TVL
  pool = {
    ...pool,
    totalValueLockedToken0: pool.totalValueLockedToken0.plus(amount0),
    totalValueLockedToken1: pool.totalValueLockedToken1.plus(amount1),
  };
  // Only update liquidity if position is in range
  if (
    event.params.tickLower <= (pool.tick ?? 0n) &&
    event.params.tickUpper > (pool.tick ?? 0n)
  ) {
    pool = {
      ...pool,
      liquidity: pool.liquidity + event.params.liquidityDelta,
    };
  }
  // Update token TVL
  token0 = {
    ...token0,
    totalValueLocked: token0.totalValueLocked.plus(amount0),
  };
  token1 = {
    ...token1,
    totalValueLocked: token1.totalValueLocked.plus(amount1),
  };
  // Store current pool TVL for later
  const currentPoolTvlETH = pool.totalValueLockedETH;
  const currentPoolTvlUSD = pool.totalValueLockedUSD;
  // After updating token TVLs, calculate ETH and USD values
  pool = {
    ...pool,
    totalValueLockedETH: pool.totalValueLockedToken0
      .times(token0.derivedETH)
      .plus(pool.totalValueLockedToken1.times(token1.derivedETH)),
  };
  pool = {
    ...pool,
    totalValueLockedUSD: pool.totalValueLockedETH.times(bundle.ethPriceUSD),
  };
  // Update PoolManager
  let poolManager = await context.PoolManager.getOrThrow(
    `${event.chainId}_${event.srcAddress}`
  );
  poolManager = {
    ...poolManager,
    txCount: poolManager.txCount + 1n,
    // Reset and recalculate TVL
    totalValueLockedETH: poolManager.totalValueLockedETH
      .minus(currentPoolTvlETH)
      .plus(pool.totalValueLockedETH),
  };
  poolManager = {
    ...poolManager,
    totalValueLockedUSD: poolManager.totalValueLockedETH.times(
      bundle.ethPriceUSD
    ),
  };

  // Create ModifyLiquidity entity
  const modifyLiquidityId = `${event.chainId}_${event.transaction.hash}_${event.logIndex}`;
  const modifyLiquidity = {
    id: modifyLiquidityId,
    chainId: BigInt(event.chainId),
    transaction: event.transaction.hash,
    timestamp: BigInt(event.block.timestamp),
    pool_id: pool.id,
    token0_id: token0.id,
    token1_id: token1.id,
    sender: event.params.sender,
    origin: event.transaction.from || "NONE",
    amount: event.params.liquidityDelta,
    amount0: amount0,
    amount1: amount1,
    amountUSD: amountUSD,
    tickLower: BigInt(event.params.tickLower),
    tickUpper: BigInt(event.params.tickUpper),
    logIndex: BigInt(event.logIndex),
  };

  console.log("📋 ModifyLiquidity object:", {
    ...modifyLiquidity,
    // 转换BigInt为string以便打印
    chainId: modifyLiquidity.chainId.toString(),
    timestamp: modifyLiquidity.timestamp.toString(),
    amount: modifyLiquidity.amount.toString(),
    amount0: modifyLiquidity.amount0.toString(),
    amount1: modifyLiquidity.amount1.toString(),
    amountUSD: modifyLiquidity.amountUSD.toString(),
    tickLower: modifyLiquidity.tickLower.toString(),
    tickUpper: modifyLiquidity.tickUpper.toString(),
    logIndex: modifyLiquidity.logIndex.toString()
  });

  // tick entities - using getOrCreate API
  const lowerTickIdx = Number(event.params.tickLower);
  const upperTickIdx = Number(event.params.tickUpper);

  const lowerTickId = pool.id + "#" + BigInt(event.params.tickLower).toString();
  const upperTickId = pool.id + "#" + BigInt(event.params.tickUpper).toString();

  let lowerTick = await context.Tick.getOrCreate(
    await createTick(
      lowerTickId,
      lowerTickIdx,
      pool.id,
      BigInt(event.chainId),
      BigInt(event.block.timestamp),
      BigInt(event.block.number),
      context
    )
  );

  let upperTick = await context.Tick.getOrCreate(
    await createTick(
      upperTickId,
      upperTickIdx,
      pool.id,
      BigInt(event.chainId),
      BigInt(event.block.timestamp),
      BigInt(event.block.number),
      context
    )
  );

  const amount = event.params.liquidityDelta;
  lowerTick = {
    ...lowerTick,
    liquidityGross: lowerTick.liquidityGross + amount,
    liquidityNet: lowerTick.liquidityNet + amount,
  };
  upperTick = {
    ...upperTick,
    liquidityGross: upperTick.liquidityGross + amount,
    liquidityNet: upperTick.liquidityNet - amount,
  };

  // Save tick entities
  await context.Tick.set(lowerTick);
  await context.Tick.set(upperTick);

  // Check if this is a hooked pool and update HookStats
  const isHookedPool =
    pool.hooks !== "0x0000000000000000000000000000000000000000";

  if (isHookedPool) {
    const hookStatsId = `${event.chainId}_${pool.hooks}`;
    let hookStats = await context.HookStats.get(hookStatsId);

    if (hookStats) {
      // Update the TVL for this hook
      hookStats = {
        ...hookStats,
        totalValueLockedUSD: hookStats.totalValueLockedUSD
          .minus(currentPoolTvlUSD) // Remove old TVL
          .plus(pool.totalValueLockedETH.times(bundle.ethPriceUSD)), // Add new TVL
      };
      await context.HookStats.set(hookStats);
    }
  }

  try {
    await context.ModifyLiquidity.set(modifyLiquidity);
    await context.PoolManager.set(poolManager);
    await context.Pool.set(pool);
    await context.Token.set(token0);
    await context.Token.set(token1);
    console.log("✅ Successfully processed ModifyLiquidity event for pool:", pool.id, "| Liquidity delta:", event.params.liquidityDelta?.toString());
  } catch (error) {
    console.error("❌ Error processing ModifyLiquidity event:", error);
    throw error;
  }
});
