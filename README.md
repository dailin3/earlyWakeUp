# EarlyWakeUp

一个基于 Ethereum 的早起打卡合约，用 ETH 作为自我激励的奖池。

## 设计思路

合约核心只有四个状态：

1. **`score`**：当前累计分数
2. **`target`**：目标分数（部署时写死，不可修改）
3. **`targetTime`**：最早可提取奖励的时间戳（部署时写死，不可修改）
4. **`lastCheckIn`**：上一次签到的时间戳

奖池直接用 `address(this).balance` 表示，来自你的下注和他人的捐赠。

`target` 和 `targetTime` 在构造函数中一次性设定，之后不可更改。这样捐赠者可以放心：owner 无法通过中途降低目标来绕过承诺。

## 机制说明

### 1. 设定目标

部署时通过构造函数一次性设置 `target` 和 `targetTime`，之后无法修改。

```solidity
constructor(uint256 _target, uint256 _targetTime)
```

- `_target = 0` 会 revert
- 部署后 `owner = msg.sender`

### 2. 存入奖励

```solidity
function donate() external payable
```

任何人都可以向合约转入 ETH，增加奖池。合约同时实现了 `receive()`，所以直接给合约地址转账也会触发 `Donated` 事件。

### 3. 签到得分

```solidity
function checkIn() external onlyOwner
```

owner 每天只能在 UTC+8 的签到窗口内签到一次：

| 时间（UTC+8） | 得分 |
|-------------|------|
| 5:30 - 6:30 | 100  |
| 6:30 - 7:00 | 80   |
| 7:00 - 7:30 | 60   |
| 7:30 - 8:00 | 40   |
| 8:00 - 8:30 | 20   |
| 其他时间    | 不能签到 |

早于 5:30 也不算数，防止“通宵不睡”伪造早起。

时间窗口采用左闭右开 `[start, end)`。例如 6:30:00 整属于 80 分段。

签到日期按 UTC+8 计算：

```solidity
dayIndex = (timestamp + 8 hours) / 1 days
```

同一天只能签到一次，跨天以 `dayIndex` 为准。

### 4. 漏签惩罚

如果今天签到或提取时，发现从前一次签到到昨天之间存在 N 天漏签，则先把旧分打 N 次八折：

```
penalizedScore = floor(score * 0.8^N)
```

合约中为了避免大数溢出，实际实现为逐步 floor：

```solidity
for (i = 0; i < N; i++) {
    score = score * 4 / 5;
}
```

这与严格的一次性 `floor(score * 0.8^N)` 在较大 N 时可能有 1~2 分整数误差，但完全满足使用场景，且燃气更省、不会溢出。

打完折扣后：

- 如果 `penalizedScore < 80`，则 `score = 0`，并且本次操作不得分（触发重置）。
- 如果 `penalizedScore >= 80`，则继续正常流程。

如果当前 `score == 0`，直接加上今天的得分（仅签到时）。

### 5. 提取奖励

```solidity
function withdraw() external onlyOwner
```

当 `block.timestamp >= targetTime` 后，owner 可以提取奖励。

**提取前会先重新计算漏签惩罚**，防止“攒够分后停止打卡直接提现”绕过惩罚机制。也就是说，提取时使用的分数不是 `score` 变量里的陈旧值，而是已经按当前时间打完折后的分数。

可提取金额：

```
amount = balance * min(penalizedScore, target) / target
```

提取完成后，`score` 直接清零。剩余 ETH 留在合约中，作为下一周期的初始奖池（但 `target`/`targetTime` 不会重置，要开启新周期需要部署新合约）。

提取遵循 Checks-Effects-Interactions 模式：先 `score = 0`，再转账，避免重入。

### 6. 生命周期示例

1. 部署合约：`new EarlyWakeUp(1000, 30天后)`，初始 score = 0
2. owner 转入 1 ETH 作为下注
3. 每天 6:00 签到，每次得 100 分
4. 第 30 天到达 `targetTime`，score = 500，owner 提取 `1 ETH * 500 / 1000 = 0.5 ETH`，score 归零
5. 剩余 0.5 ETH 留在合约中。由于 target/targetTime 不可改，要继续新一轮挑战需要部署新合约

## 关键函数

| 函数 | 说明 |
|------|------|
| `donate()` | 任何人存入 ETH 增加奖池 |
| `receive()` | 直接转账给合约也会计入奖池 |
| `checkIn()` | owner 在 UTC+8 窗口内签到得分 |
| `withdraw()` | owner 在 targetTime 后提取 ETH，提取前计算漏签惩罚，提取后 score = 0 |
| `currentDay()` / `currentTimeOfDay()` / `currentPoints()` | 查看当前 UTC+8 日期、时间和可得分 |
| `missedDays()` / `penalizedScore()` | 查看当前漏签天数和打折后的分数 |
| `claimableReward()` | 查看当前可提取的 ETH 数量（已应用漏签惩罚） |

## 本地测试

依赖 Foundry：

```bash
forge test -vvv
```

测试覆盖了：

- 各个签到窗口的得分
- 时间边界（6:30 整属于 80 分段）
- 同天重复签到失败
- 漏签 1 天、2 天、多天后的惩罚与重置
- 提取奖励的比例、封顶 100%、提取后 score 清零
- 提取前漏签惩罚生效

## 部署脚本

```bash
export TARGET=1000
export TARGET_TIME=1706630400  # 目标时间戳（UTC）
forge script script/EarlyWakeUp.s.sol --rpc-url <RPC_URL> --broadcast --private-key <KEY>
```

## 注意事项

1. 合约中所有时间计算都基于 `block.timestamp` 转换为 UTC+8。
2. 签到只能由 owner 执行。
3. `target` 和 `targetTime` 部署后不可修改，部署前请确认。
4. 提取奖励后 score 清零，必须重新签到才能再次提取。
5. 提取奖励使用 `.call` 转账，owner 地址不能是拒绝 ETH 的合约。
6. 漏签惩罚在签到和提取时都会计算，不能通过“不打卡直接提现”来规避。
7. 没有 ownership 转移机制，请妥善保管私钥。
