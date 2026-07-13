# Fuel Tracker v5

个人油耗记录与分析工具。FastAPI + React + MariaDB，Docker 一键部署。

## 功能概览

- 多车辆管理
- 加油记录（日期、里程、油量、油费、油站、油品）
- 养护记录（保养、维修、自定义项目，含提醒）
- 统计分析：月度油耗趋势、费用柱状图、年度对比
- 数据导入/导出（JSON 全量备份与恢复）
- 响应式布局：手机底部导航 / 平板顶部标签 / 桌面侧边栏
- 深色/浅色主题切换

## 快速开始

### 1. 准备环境变量

在项目根目录创建 `.env` 文件：

```bash
# 必填 — 生成密钥：python3 -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=你的JWT签名密钥

# 必填 — 登录账密
ADMIN_USER=admin
ADMIN_PASSWORD=你的密码

# 可选 — 数据库（有默认值）
MYSQL_ROOT_PASSWORD=Fuel@2026TestRoot
MYSQL_USER=fuel_user
MYSQL_PASSWORD=Fuel@2026Test
MYSQL_DATABASE=fuel_tracker

# 可选 — 应用
APP_PORT=8080
CORS_ORIGINS='["http://localhost:8080"]'
```

> `SECRET_KEY` 和 `ADMIN_PASSWORD` 是必须设置的，缺少时 Docker Compose 会报错拒绝启动。

### 2. 构建并启动

```bash
docker compose up -d --build
```

启动完成后访问 `http://localhost:8080`，会自动跳转到登录页。

### 3. 登录

使用 `.env` 中配置的 `ADMIN_USER` / `ADMIN_PASSWORD` 登录。

- 连续 **5 次**密码错误会锁定该 IP **15 分钟**
- 登录后 Token 有效期 **24 小时**，过期后自动跳转回登录页

## 环境变量一览

| 变量 | 必填 | 默认值 | 说明 |
|------|:----:|--------|------|
| `SECRET_KEY` | ✅ | — | JWT 签名密钥，必须随机生成 |
| `ADMIN_USER` | ✅ | `admin` | 登录用户名 |
| `ADMIN_PASSWORD` | ✅ | — | 登录密码 |
| `TOKEN_EXPIRE_HOURS` | | `24` | Token 有效时长（小时） |
| `MYSQL_HOST` | | `db` | 数据库地址（容器内默认 `db`） |
| `MYSQL_PORT` | | `3306` | 数据库端口 |
| `MYSQL_USER` | | `fuel_user` | 数据库用户 |
| `MYSQL_PASSWORD` | | `Fuel@2026Test` | 数据库密码 |
| `MYSQL_DATABASE` | | `fuel_tracker` | 数据库名 |
| `MYSQL_ROOT_PASSWORD` | | `Fuel@2026TestRoot` | MariaDB root 密码 |
| `APP_PORT` | | `8080` | 宿主机暴露端口 |
| `APP_ENV` | | `prod` | `dev` / `prod` |
| `CORS_ORIGINS` | | `["http://localhost:8080"]` | 允许的前端来源（JSON 数组） |

## 本地开发

### 后端

```bash
# 安装依赖
pip install uv
uv pip install -e ".[dev]"

# 创建 .env（开发环境可简化）
cat > .env << 'EOF'
ADMIN_USER=admin
ADMIN_PASSWORD=dev123
SECRET_KEY=dev-secret-key-not-for-production
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
APP_ENV=dev
EOF

# 启动（需要本地 MariaDB 或远程数据库）
uvicorn app.main:app --reload --port 8000
```

### 前端

```bash
cd static
npm install
npm run dev    # Vite dev server → http://localhost:5173
```

开发模式下前端通过 Vite proxy 或 `VITE_API_BASE` 环境变量连接后端。

## 项目结构

```
fuel-tracker/
├── app/                    # FastAPI 后端
│   ├── main.py             # 应用入口
│   ├── config.py           # 环境变量配置
│   ├── security.py         # JWT 认证 + 防暴力破解
│   ├── db.py               # 数据库连接
│   ├── models/             # SQLModel 数据模型
│   ├── schemas/            # Pydantic 请求/响应模型
│   ├── routers/            # API 路由
│   │   ├── vehicles.py     # 车辆 CRUD
│   │   ├── records.py      # 加油记录 CRUD
│   │   ├── maintenance.py  # 养护记录 CRUD
│   │   ├── analytics.py    # 统计分析
│   │   └── admin.py        # 数据导入/导出
│   └── services/           # 业务逻辑
├── static/                 # React 前端
│   ├── src/
│   │   ├── pages/          # 页面组件
│   │   ├── components/     # 通用组件
│   │   ├── lib/            # 工具库（API、认证、格式化）
│   │   └── routes.tsx      # 路由定义
│   └── package.json
├── tests/                  # 测试
├── docker-compose.yml      # 生产部署
├── docker-compose.prod.yml # 生产覆盖配置
├── Dockerfile              # 多阶段构建
└── pyproject.toml          # Python 项目配置
```

## API 端点

所有 `/api/v1/*` 端点（除 `/health` 和 `/auth/login`）需要在请求头携带：

```
Authorization: Bearer <JWT token>
```

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/auth/login` | 登录，返回 JWT |
| GET | `/api/v1/auth/me` | 验证 Token，返回用户名 |
| GET | `/api/v1/health` | 健康检查（无需认证） |
| GET | `/api/v1/vehicles` | 车辆列表 |
| POST | `/api/v1/vehicles` | 创建车辆 |
| PUT | `/api/v1/vehicles/:vid` | 更新车辆 |
| DELETE | `/api/v1/vehicles/:vid` | 删除车辆 |
| GET | `/api/v1/vehicles/:vid/records` | 加油记录列表 |
| POST | `/api/v1/vehicles/:vid/records` | 创建加油记录 |
| PUT | `/api/v1/records/:rid` | 更新加油记录 |
| DELETE | `/api/v1/records/:rid` | 删除加油记录 |
| GET | `/api/v1/vehicles/:vid/maintenance` | 养护记录列表 |
| POST | `/api/v1/vehicles/:vid/maintenance` | 创建养护记录 |
| PUT | `/api/v1/maintenance/:mid` | 更新养护记录 |
| DELETE | `/api/v1/maintenance/:mid` | 删除养护记录 |
| GET | `/api/v1/vehicles/:vid/analytics` | 月度统计分析 |
| GET | `/api/v1/admin/export` | 全量数据导出 |
| POST | `/api/v1/admin/import` | 全量数据导入 |

## 数据备份与恢复

```bash
# 导出（需先登录获取 token）
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"你的密码"}' | jq -r .access_token)

curl -s http://localhost:8080/api/v1/admin/export \
  -H "Authorization: Bearer $TOKEN" > backup.json

# 恢复
curl -s -X POST http://localhost:8080/api/v1/admin/import \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d @backup.json
```

## 安全说明

- **认证**：JWT Token，有效期可配置（默认 24 小时）
- **防暴力破解**：同一 IP 连续 5 次登录失败后锁定 15 分钟
- **密码存储**：账密通过 Docker 环境变量注入，不写入代码或镜像
- **数据库**：端口不对外暴露，仅容器内网访问
- **CORS**：可通过 `CORS_ORIGINS` 精确控制允许的前端域名
