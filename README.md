# EarlyWakeUp

一个基于 Ethereum 的早起打卡合约，用 ETH 作为自我激励的奖池。

## 设计思路

合约核心状态：

1. **`score`**：当前周期累计分数
2. **`target`**：目标分数（部署时写死，不可修改）
3. **`cooldown`**：每个周期需要等待的秒数（部署时写死）
4. **`cooldownStart`**：当前周期第一次签到时间，0 表示周期尚未开始
5. **`lastCheckIn`**：上一次签到的时间戳

奖池直接用 `address(this).balance` 表示，来自你的下注和他人的捐赠。

`target` 和 `cooldown` 在构造函数中一次性设定，之后不可更改。

## 机制说明

### 1. 设定目标

部署时通过构造函数一次性设置 `target` 和 `cooldown`。

```solidity
constructor(uint256 _target, uint256 _cooldown)
```

- `_target = 0` 会 revert
- `_cooldown = 0` 会 revert
- 部署后 `owner = msg.sender`
- 部署后 `cooldownStart = 0`，表示还没有开始任何周期

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

- 如果 `penalizedScore < 80`，则 `score = 0`，触发周期重置。
- 如果 `penalizedScore >= 80`，则继续正常流程。

**注意**：漏签导致的重置**不会刷新 `cooldownStart`**。冷却只在你从 `score == 0` 开始新一轮签到时才会重新计算。

### 5. 周期与提款

```solidity
function withdraw() external onlyOwner
```

一个周期从 **`score == 0` 的第一次签到**开始，此时 `cooldownStart` 被设为当前时间。

提款必须满足：

1. `score > 0`
2. `block.timestamp >= cooldownStart + cooldown`

**提取前会先重新计算漏签惩罚**，防止“攒够分后停止打卡直接提现”绕过惩罚机制。

可提取金额：

```
amount = balance * min(penalizedScore, target) / target
```

提取完成后 `score = 0`，但**不会刷新 `cooldownStart`**。下一周期从你再次从 0 签到开始重新计时。

提取遵循 Checks-Effects-Interactions 模式：先改状态，再转账，避免重入。

### 6. 生命周期示例

假设 `target = 1000`，`cooldown = 7 days`：

1. 部署合约，`cooldownStart = 0`
2. 第 0 天第一次签到，`cooldownStart = 第 0 天`，score = 100
3. 每天 6:00 签到，每次得 100 分
4. 第 7 天冷却结束，若 score = 700，owner 提取 `1 ETH * 700 / 1000 = 0.7 ETH`
5. score 归零，但 `cooldownStart` 不变
6. 第 8 天重新签到，开启新周期，`cooldownStart = 第 8 天`
7. 第 15 天若 score = 1000，owner 提取当前全部余额

如果中间漏签导致 score < 80，score 归零，但 `cooldownStart` 保持原值。你可以立刻重新签到开启新周期，不需要额外等待。

## 关键函数

| 函数 | 说明 |
|------|------|
| `donate()` | 任何人存入 ETH 增加奖池 |
| `receive()` | 直接转账给合约也会计入奖池 |
| `checkIn()` | owner 在 UTC+8 窗口内签到得分；从 0 开始签到时开启新周期 |
| `withdraw()` | owner 在周期冷却结束后提取 ETH，提取前计算漏签惩罚，提取后 score = 0 |
| `currentDay()` / `currentTimeOfDay()` / `currentPoints()` | 查看当前 UTC+8 日期、时间和可得分 |
| `missedDays()` / `penalizedScore()` | 查看当前漏签天数和打折后的分数 |
| `claimableReward()` | 查看当前可提取的 ETH 数量（已应用漏签惩罚和冷却检查） |

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
- 冷却期内不能提款
- 提款后进入新周期
- 漏签重置不刷新冷却
- 多周期提款
- 提取奖励的比例、封顶 100%

## 部署脚本

```bash
export TARGET=1000
export COOLDOWN=604800  # 7 天（秒）
forge script script/EarlyWakeUp.s.sol --rpc-url <RPC_URL> --broadcast --private-key <KEY>
```

## 注意事项

1. 合约中所有时间计算都基于 `block.timestamp` 转换为 UTC+8。
2. 签到只能由 owner 执行。
3. `target` 和 `cooldown` 部署后不可修改，部署前请确认。
4. 一个周期从 `score == 0` 的第一次签到开始计时。
5. 漏签导致 score < 80 时只会重置 score，不会刷新冷却；你可以立刻重新签到开始新周期。
6. 提款成功后 score 归零，但冷却起点不变；下一周期从再次签到开始重新计时。
7. 提取奖励使用 `.call` 转账，owner 地址不能是拒绝 ETH 的合约。
8. 没有 ownership 转移机制，请妥善保管私钥。

---

## 前端网站

项目包含一个 React + Vite + wagmi + RainbowKit 前端，用于在浏览器里直接签到、捐赠、提取和查看历史。

### 目录

```
frontend/
├── src/
│   ├── App.tsx        # 主界面
│   ├── wagmi.ts       # 钱包和链配置
│   ├── constants.ts   # 合约地址、ABI、工具函数
│   └── components/
│       └── Heatmap.tsx # 签到热力图
├── index.html
├── vite.config.ts
└── package.json
```

### 本地运行

```bash
cd frontend
npm install
npm run dev
```

打开 http://localhost:5173

提交前可运行：

```bash
npm test
npm run lint
npm run build
```

### 配置 WalletConnect Project ID

RainbowKit 需要 WalletConnect 项目 ID 才能提供移动端钱包扫码连接。

1. 访问 https://cloud.walletconnect.com/ 注册并创建项目
2. 复制 Project ID
3. 本地开发可在 `frontend/.env` 覆盖 Supabase 的公开项目配置：

```bash
VITE_WALLETCONNECT_PROJECT_ID=你的_project_id
```

如果不配置，网站仍然可以运行，但 WalletConnect 相关的连接方式会失败。

### 部署到 Vercel

1. 把代码 push 到 GitHub
2. 在 Vercel 导入项目
3. 设置 Root Directory 为 `frontend`
4. 添加环境变量 `VITE_WALLETCONNECT_PROJECT_ID`
5. 点击 Deploy

Vercel 会自动识别 Vite 配置，构建命令为 `npm run build`，输出目录为 `dist`。

### 前端功能

- 连接钱包（MetaMask / Rabby / WalletConnect 等）
- 查看当前 score、target、奖池余额、可提取金额
- 进度条和冷却倒计时
- 当前 UTC+8 签到窗口提示
- 一键 Check In（仅 owner 可用）
- 一键 Withdraw（仅 owner 可用）
- 输入 ETH 金额一键 Donate（任何人可用）
- 最近 90 天签到热力图（按北京时间 UTC+8、周一到周日排列）
- 历史事件列表（CheckedIn / Donated / Withdrawn）

链上事件从合约部署区块开始按 RPC 支持的区块范围分段读取，避免公共节点拒绝超大范围的 `eth_getLogs` 请求。

分数、目标、奖池、可领取金额、冷却时间和上次签到时间直接读取合约状态；签到热力图与历史记录根据链上 Event 及其区块时间生成。只有捐赠者的登录身份、显示名称和留言保存在 Supabase，Supabase 不作为链上金额或签到状态的事实来源。

### 新增：Supabase 登录与感谢名单

2026-07-29 更新：前端增加了 Supabase 登录和捐赠感谢名单功能。

- **不强制登录**：任何人都可以直接 donate ETH 到合约
- **捐赠后留名**：donate 交易发出后，会弹窗询问是否愿意登录留名
  - 匿名捐赠：可填写昵称
  - 登录留名：跳转到 `login.dailin.tech` 统一登录，并自动显示 OAuth 用户名或邮箱
  - 完全匿名：不留任何信息
- **捐赠后留言**：可以留一句话给 owner，显示在感谢名单里
- **感谢名单**：页面底部展示最近 50 条捐赠记录，包括昵称、钱包地址、金额、留言

### 需要的 Supabase 配置

1. 在 Supabase Dashboard → SQL Editor 执行：

```sql
create table if not exists public.donations (
  id bigint generated always as identity primary key,
  created_at timestamp with time zone default now(),
  chain text not null default 'arbitrum',
  contract_address text not null,
  donor_wallet text not null,
  donor_user_id uuid references auth.users(id),
  donor_email text,
  donor_name text,
  amount_eth numeric not null,
  tx_hash text not null unique,
  message text,
  is_anonymous boolean not null default true,
  confirmed boolean not null default true
);

alter table public.donations enable row level security;

drop policy if exists "Allow public read" on public.donations;
create policy "Allow public read" on public.donations
  for select using (true);

drop policy if exists "Allow anonymous inserts" on public.donations;
create policy "Allow anonymous inserts" on public.donations
  for insert with check (true);

drop policy if exists "Allow users to update own records" on public.donations;
create policy "Allow users to update own records" on public.donations
  for update using (auth.uid() = donor_user_id);
```

2. 登录由 `login.dailin.tech` 统一处理。两个应用必须使用同一个 Supabase 项目，并在生产环境通过 `.dailin.tech` Cookie 共享会话。

3. 创建 `frontend/.env`：

```env
VITE_WALLETCONNECT_PROJECT_ID=YOUR_PROJECT_ID
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

生产构建默认使用 `dailin.tech` 共享的 Supabase 项目公开 URL 和 publishable key；仓库中不包含 service-role key、个人访问令牌或 SMTP 密钥。

### 部署

方式一：Cloudflare Pages / Vercel
- 上传代码，设置环境变量，构建命令 `cd frontend && npm run build`，输出目录 `frontend/dist`

方式二：Docker
```bash
cd frontend
docker build \
  --build-arg VITE_WALLETCONNECT_PROJECT_ID=... \
  --build-arg VITE_SUPABASE_URL=... \
  --build-arg VITE_SUPABASE_ANON_KEY=... \
  -t earlywakeup:latest .
docker run -p 3000:80 -d earlywakeup:latest
```
