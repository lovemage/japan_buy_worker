# vovosnap SMS Relay — GCP 台湾 VM + Cloudflare Tunnel

## 概述

Cloudflare Worker 直连 Every8D API 会被 CloudFront 阻挡（403），因为 Worker 的出站 IP 非台湾地区。解决方案是用 GCP 台湾 VM 做中转，搭配 Cloudflare Tunnel 建立安全通道。

架构：
```
Cloudflare Worker → relay.vovosnap.com (Tunnel) → GCP VM (Taiwan) → Every8D
```

---

## 1. GCP VM 建立

### 1.1 启用 Compute Engine API

GCP Console → Compute Engine → 启用 API

### 1.2 建立实例

Compute Engine → VM 执行个体 → 建立执行个体：

| 栏位 | 值 |
|------|-----|
| 名称 | `smsrelay` |
| 区域 | `asia-east1 (Taiwan)` |
| 机器类型 | `e2-micro` |
| 开机磁碟 | Ubuntu 22.04 LTS, 10 GB |
| 防火墙 | 允许 HTTP 流量 |

### 1.3 防火墙规则

VPC 网路 → 防火墙 → 建立防火墙规则：

- 名称：`allow-sms-relay`
- 目标：网路中的所有执行个体
- 来源 IP 范围：`0.0.0.0/0`
- 通讯协定/连接埠：TCP `80`

---

## 2. Relay Server 部署

### 2.1 安装 Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2.2 建立专案

```bash
mkdir ~/sms-relay && cd ~/sms-relay
npm init -y
npm install express
```

### 2.3 下载 server.js

```bash
curl -sL -o ~/sms-relay/server.js https://gist.githubusercontent.com/lovemage/d1b7fa3613052b69dc7894bb8b756294/raw/relay-server-cjs.js
```

### 2.4 建立 systemd 服务

```bash
sudo nano /etc/systemd/system/sms-relay.service
```

贴入以下内容（替换 `EVERY8D_UID`、`EVERY8D_PWD`、`RELAY_TOKEN` 为真实值）：

```
[Unit]
Description=SMS Relay
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/home/<YOUR_USER>/sms-relay
Environment=EVERY8D_UID=<你的Every8D UID>
Environment=EVERY8D_PWD=<你的Every8D密码>
Environment=EVERY8D_SITE_URL=new.e8d.tw
Environment=RELAY_TOKEN=<自订随机密码>
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable sms-relay
sudo systemctl start sms-relay
sudo systemctl status sms-relay
```

---

## 3. Cloudflare Tunnel 设定

### 3.1 安装 cloudflared

```bash
curl -L -o /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i /tmp/cloudflared.deb
```

### 3.2 认证

```bash
cloudflared tunnel login
```

浏览器打开输出的 URL，授权到 vovosnap.com 的 Cloudflare 帐号。

### 3.3 建立 Tunnel

```bash
cloudflared tunnel create sms-relay
```

记住输出的 tunnel ID（如 `103549a9-a887-499c-a4f6-cd85bd896723`）。

### 3.4 建立设定档

```bash
cat > ~/.cloudflared/config.yml << EOF
tunnel: <tunnel-id>
credentials-file: /home/<YOUR_USER>/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: relay.vovosnap.com
    service: http://localhost:80
  - service: http_status:404
EOF
```

### 3.5 建立 DNS 路由

```bash
cloudflared tunnel route dns sms-relay relay.vovosnap.com
```

### 3.6 安装为系统服务

```bash
sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/config.yml /etc/cloudflared/config.yml
sudo cp ~/.cloudflared/<tunnel-id>.json /etc/cloudflared/<tunnel-id>.json
```

编辑 `/etc/cloudflared/config.yml`，将 `credentials-file` 路径改为 `/etc/cloudflared/<tunnel-id>.json`：

```bash
sudo nano /etc/cloudflared/config.yml
```

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl status cloudflared
```

---

## 4. Worker 端设定

### 4.1 wrangler.toml

```toml
[vars]
SMS_RELAY_URL = "https://relay.vovosnap.com/send"
```

### 4.2 设定 Secret

```bash
npx wrangler secret put SMS_RELAY_TOKEN
# 输入跟 VM 上 RELAY_TOKEN 一样的值
```

### 4.3 部署

```bash
npx wrangler deploy
```

---

## 5. 验证

### 5.1 测试 Relay 本身

```bash
curl -X POST "https://relay.vovosnap.com/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <RELAY_TOKEN>" \
  -d '{"phone":"+886979661678","message":"relay test"}'
```

### 5.2 测试 Worker 发送

在 vovosnap.com 登入后台，进入手机验证页面发送验证码。

---

## 6. 原理说明

- Cloudflare Worker 出站 IP 非台湾，Every8D 的 CloudFront 返回 403
- GCP asia-east1 (台湾) 的 IP 可正常呼叫 Every8D API
- Worker 无法直连 GCP VM IP（Cloudflare 网路会误路由到 Every8D 的 CDN）
- 透过 Cloudflare Tunnel，Worker 使用 `fetch("https://relay.vovosnap.com/send")` 内部呼叫
- Cloudflare 网路内 `fetch()` 同 zone 不触发 Worker 路由循环，直接走 Tunnel → VM → Every8D

---

## 7. 回切方案

若 Every8D 解除 IP 限制，只需：

1. 移除 `wrangler.toml` 中的 `SMS_RELAY_URL`
2. 移除 `SMS_RELAY_TOKEN` secret：
   ```bash
   npx wrangler secret delete SMS_RELAY_TOKEN
   ```
3. `npx wrangler deploy`

Worker 会自动回退到直连 Every8D 模式。
