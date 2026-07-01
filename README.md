# 油耗记录 v4

车辆油耗追踪工具，支持多车管理、加油记录、保养提醒、数据分析、驾驶行为评分。

**v4 改动：** 从 localStorage 单机版 → Docker + MariaDB 服务器版。

## 技术栈

- 后端: Python Flask
- 数据库: MariaDB 10.11
- 前端: 纯 HTML/JS (Canvas 图表)
- 部署: Docker Compose

## 快速开始

### 本地部署

```bash
# 1. 启动
docker compose up -d

# 2. 访问
open http://localhost:5080

# 3. 停止
docker compose down
```

### 群晖 NAS 部署

1. 套件中心安装 **Docker**
2. 创建 `docker-compose.yml`：
```yaml
services:
  app:
    image: whr2333/fuel-tracker:latest
    container_name: fuel-tracker
    restart: unless-stopped
    ports:
      - "5080:5000"
    environment:
      - MYSQL_HOST=your-mariadb-host
      - MYSQL_USER=fuel
      - MYSQL_PASSWORD=your-password
  # 如果群晖已安装 MariaDB 套件，用上面的配置指向它即可
  # 否则加上下面的 mariadb 服务
  mariadb:
    image: mariadb:10.11
    restart: unless-stopped
    environment:
      - MARIADB_ROOT_PASSWORD=your-root-password
      - MARIADB_DATABASE=fuel_tracker
      - MARIADB_USER=fuel
      - MARIADB_PASSWORD=your-password
    volumes:
      - db_data:/var/lib/mysql

volumes:
  db_data:
```
3. `docker compose up -d`
4. 访问 `http://nas-ip:5080`

### 更新

```bash
docker compose pull && docker compose up -d
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MYSQL_HOST` | `mariadb` | 数据库地址 |
| `MYSQL_PORT` | `3306` | 数据库端口 |
| `MYSQL_USER` | `fuel` | 数据库用户 |
| `MYSQL_PASSWORD` | `change_me_please` | 数据库密码 |
| `MYSQL_DATABASE` | `fuel_tracker` | 数据库名 |

## 更新

```bash
git pull
docker compose up -d --build
```

## 数据备份

MariaDB 数据卷 `db_data` 持久化在 Docker volume 中。

```bash
# 导出 SQL
docker compose exec mariadb mysqldump -u fuel -p fuel_tracker > backup.sql

# 导入
docker compose exec -T mariadb mysql -u fuel -p fuel_tracker < backup.sql
```
