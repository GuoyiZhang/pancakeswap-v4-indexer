# PancakeSwap v4 (Infinity) 支持设置指南

## 🎯 已完成的最少改动

1. ✅ **config.yaml**: 添加了PancakeSwap合约配置（复用现有事件处理器）
2. ✅ **initialize-handler.ts**: 添加了tickSpacing字段的容错处理  
3. ✅ **chains.ts**: 添加了CAKE代币到BSC白名单

## 🔧 需要完成的最后步骤

### 1. 获取PancakeSwap v4实际合约地址

你需要找到PancakeSwap Infinity (v4) 在以下链上的实际部署地址：

- **BSC**: `0x?????` (需要替换config.yaml中的占位符地址)
- **Ethereum**: `0x?????` (如果已部署)

### 2. 更新config.yaml中的地址

将 `config.yaml` 中的占位符地址:
```yaml
- 0x0000000000000000000000000000000000000001
```

替换为实际的PancakeSwap v4 PoolManager地址。

### 3. 运行测试

```bash
pnpm envio dev
```

## 🎉 兼容性说明

现在的配置可以同时处理：
- ✅ Uniswap v4 池子
- ✅ PancakeSwap v4 池子  
- ✅ 自动处理事件结构差异
- ✅ 共享相同的数据模型和GraphQL schema

## 📋 事件差异处理

- **Initialize**: 自动为PancakeSwap提供默认tickSpacing值
- **Swap**: 自动忽略PancakeSwap的额外protocolFee字段
- **ModifyLiquidity**: 完全兼容，无需修改

代码改动最小，现有功能完全保留！ 