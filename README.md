# 省油的灯

个人油耗记录与分析工具。FastAPI + React + MariaDB，Docker 一键部署。

## 功能概览

- **多用户**：管理员创建用户，数据完全隔离
- **加油记录**：日期时间、里程、油量、单价、机显/实付金额、油品、加油站
- **油耗计算**：两次加满法，自动累计未满加油量，支持"上次加油没记录"标记
- **养护记录**：保养、维修、自定义项目，含日期/里程提醒
- **统计分析**：8 个维度 — 总览/月度/年度/油品/加油站/趋势/驾驶行为/同车型对比
- **数据管理**：Excel (.xlsx) 导入导出，中文列名，增量导入，数据校验
- **响应式**：手机悬浮底部导航 / 平板顶部标签 / 桌面侧边栏
- **PWA**：支持添加到桌面
- **深色/浅色主题**

## 快速开始

### 1. 创建 .env

```bash
# 生成密钥
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")

# 写入 .env
cat > .env << EOF
SECRET_KEY=$SECRET_KEY
ADMIN_USER=admin
ADMIN_PASSWORD=你的密码
EOF
```

### 2. 部署

#### 方式 A：Docker Hub 镜像（推荐）

```bash
git clone https://github.com/WHR2333/fuel-tracker.git
cd fuel-tracker
docker compose up -d
```

#### 方式 B：本地构建

```bash
docker compose up -d --build
```

### 3. 登录

访问 `http://服务器IP:8080`，用 `.env` 中的账密登录。

- 连续 5 次密码错误 → 锁定 IP 15 分钟
- Token 有效期 24 小时（可配置）

### 4. 常用命令

```bash
docker compose logs -f api          # 查看日志
docker compose pull && docker compose up -d   # 更新（镜像方式）
git pull && docker compose up -d --build      # 更新（源码方式）
docker compose down                 # 停止（数据保留）
docker compose down -v              # 停止并删除数据
```

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|:----:|--------|------|
| `SECRET_KEY` | ✅ | — | JWT 签名密钥，`python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `ADMIN_USER` | ✅ | `admin` | 管理员用户名 |
| `ADMIN_PASSWORD` | ✅ | — | 管理员密码 |
| `TOKEN_EXPIRE_HOURS` | | `24` | Token 有效期（小时） |
| `MYSQL_HOST` | | `db` | 数据库地址 |
| `MYSQL_PORT` | | `3306` | 数据库端口 |
| `MYSQL_USER` | | `fuel_user` | 数据库用户 |
| `MYSQL_PASSWORD` | | `Fuel@2026Test` | 数据库密码 |
| `MYSQL_DATABASE` | | `fuel_tracker` | 数据库名 |
| `MYSQL_ROOT_PASSWORD` | | `Fuel@2026TestRoot` | MariaDB root 密码 |
| `APP_PORT` | | `8080` | 宿主机端口 |
| `APP_ENV` | | `prod` | `dev` / `prod` |
| `CORS_ORIGINS` | | `["http://localhost:8080"]` | 允许的前端来源 |

## 油耗计算规则

采用**两次加满法**（跳枪法）：

| 上次 | 本次 | 行为 |
|------|------|------|
| 加满 | 加满 | 计算油耗 = 本次加油量 ÷ 里程差 × 100 |
| 加满 | 未加满 | 不计算，油量暂存 |
| 未加满 | 未加满 | 不计算，油量累加 |
| 未加满 | 加满 | 计算油耗 = (本次+累计) ÷ (本次里程-上次满箱里程) × 100 |

- **机显金额**用于油耗/每公里费用计算
- **实付金额**用于费用统计/累计油费
- 勾选"上次加油没记录"可重置计算基准

## 数据导入导出

- **导出**：Excel (.xlsx)，3 个工作表（车辆/加油记录/保养记录），中文列名，无 ID
- **导入**：增量 upsert，按车辆名匹配，按车辆+日期+里程去重，自动校验数据合法性

## 本地开发

```bash
# 后端
python3 -m venv .venv
.venv/bin/pip install fastapi "uvicorn[standard]" sqlmodel pymysql cryptography \
  pydantic-settings python-multipart "pyjwt>=2.9" "bcrypt>=4" "openpyxl>=3.1"
.venv/bin/uvicorn app.main:app --reload --port 8000

# 前端
cd static && npm install && npm run dev
```

## 项目结构

```
fuel-tracker/
├── app/
│   ├── main.py              # 应用入口
│   ├── config.py            # 环境变量
│   ├── security.py          # JWT 认证 + 防暴力破解
│   ├── db.py                # 数据库连接 + 迁移
│   ├── models/              # 数据模型
│   ├── schemas/             # 请求/响应模型
│   ├── routers/
│   │   ├── vehicles.py      # 车辆 CRUD
│   │   ├── records.py       # 加油记录 CRUD
│   │   ├── maintenance.py   # 养护记录 CRUD
│   │   ├── analytics.py     # 统计分析
│   │   ├── users.py         # 用户管理（管理员）
│   │   └── data_io.py       # Excel 导入导出
│   └── services/helpers.py  # 工具函数
├── static/
│   ├── src/
│   │   ├── pages/           # 页面
│   │   ├── components/      # 组件
│   │   └── lib/             # API、认证、缓存、统计
│   └── public/              # 静态资源（logo、manifest）
├── Dockerfile               # 多阶段构建
├── docker-compose.yml       # 部署配置
└── pyproject.toml           # Python 依赖
```

## 安全

- JWT Token 认证，有效期可配置
- 防暴力破解：5 次失败锁定 IP 15 分钟
- 管理员/普通用户角色隔离
- 用户间数据完全隔离
- CORS 可配置
- 数据库端口不对外暴露
