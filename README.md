# EarlyWakeUp

一个基于 Ethereum 的早起打卡合约，用 ETH 作为自我激励的奖池。

## 设计思路

合约核心只有三个状态：

1. **`score`**：当前累计分数
2. **`target`**：目标分数
3. **奖池**：合约的 ETH 余额（来自你的下注 + 他人的捐赠）

合约不保存“奖池”这个独立变量，而是直接用 `address(this).balance` 表示。

## 机制说明

### 1. 设定目标

部署时通过构造函数设置 `target`：达到多少分可以提取 100% 奖池。

之后 owner 可以调用 `setTarget(target)` 修改目标，但只有在当前 `score == 0` 时才允许，防止在已经积累分数时中途改变目标。

设置新目标会同时重置 `lastCheckIn`，意味着开始一个新周期。

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

时间窗口采用左闭右开 `[start, end)`。例如 6:30:00 整属于 80 分段，不属于 100 分段。

签到日期按 UTC+8 计算：

```solidity
dayIndex = (timestamp + 8 hours) / 1 days
```

同一天只能签到一次，跨天以这个 `dayIndex` 为准。

### 4. 漏签惩罚

如果今天签到时，发现从前一次签到到昨天之间存在 N 天漏签，则先把旧分打 N 次八折：

```
penalizedScore = floor(score * 0.8^N)
```

合约中为了避免大数溢出，实际实现为逐步 floor：

```solidity
for (i = 0; i < N; i++) {
    score = score * 4 / 5;
}
```

这与严格的一次性 `floor(score * 0.8^N)` 在较大 N 时可能有 1~2 分的整数误差，但完全满足使用场景，且燃气更省、不会溢出。

打完折扣后：

- 如果 `penalizedScore < 80`，则 `score = 0`，并且今天不得分（触发重置）。
- 如果 `penalizedScore >= 80`，则 `score = penalizedScore + 今日得分`。

如果当前 `score == 0`（比如第一次签到、或上一次已经触发重置），直接加上今天的得分。

### 5. 提取奖励

```solidity
function withdraw() external onlyOwner
```

owner 随时可以提取奖励（不再受 targetTime 限制）。

可提取金额：

```
amount = balance * min(score, target) / target
```

也就是说：

- `score >= target`：提取 100% 奖池
- `score = target / 2`：提取 50% 奖池

提取完成后，`score` 直接清零。剩余没有提取的 ETH 留在合约中，作为下一周期的初始奖池（owner 需要再调用 `setTarget` 开始新周期，或继续签到累积）。

### 6. 周期流转示例

1. 部署合约：`new EarlyWakeUp(1000)`，初始 score = 0
2. owner 转入 1 ETH 作为下注（直接转账或 donate）
3. 每天 6:00 签到，每次得 100 分
4. 第 5 天想提取：score = 500，owner 提取 `1 ETH * 500 / 1000 = 0.5 ETH`，score 归零
5. 剩余 0.5 ETH 留在合约中，owner 可以调用 `setTarget(1000)` 开始新周期，也可以继续签到继续累积
6. 若想再次提取，必须重新累积分数

## 关键函数

| 函数 | 说明 |
|------|------|
| `setTarget(target)` | owner 设置新目标，重置 lastCheckIn（要求当前 score == 0） |
| `donate()` | 任何人存入 ETH 增加奖池 |
| `receive()` | 直接转账给合约也会计入奖池 |
| `checkIn()` | owner 在 UTC+8 窗口内签到得分 |
| `withdraw()` | owner 随时按比例提取 ETH，提取后 score = 0 |
| `currentDay()` / `currentTimeOfDay()` / `currentPoints()` | 查看当前 UTC+8 日期、时间和可得分 |
| `missedDays()` / `penalizedScore()` | 查看当前漏签天数和打折后的分数 |
| `claimableReward()` | 查看当前可提取的 ETH 数量 |

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
- 新周期设置与限制

## 部署脚本

```bash
export TARGET=1000
forge script script/EarlyWakeUp.s.sol --rpc-url <RPC_URL> --broadcast --private-key <KEY>
```

## 注意事项

1. 合约中所有时间计算都基于 `block.timestamp` 转换为 UTC+8。
2. 签到只能由 owner 执行，防止别人替你签到。
3. 提取奖励后 score 清零，必须重新签到才能再次提取。
4. 提取奖励使用 `.call` 转账，注意 owner 地址不能是拒绝 ETH 的合约（否则转账失败会 revert）。
5. 修改 `target` 只能在 `score == 0` 时进行，避免中途改变目标。
