# AWS deployment (free tier) — AI Dashboard

Deploy the **NestJS BFF** to **Elastic Beanstalk** and the **React UI** to **Amplify Hosting**, then register the BFF MCP endpoint in **Trimble Assist Stage**.

**Test branch:** `feature/mcp-apps-canvas` (Amplify + GitHub Actions). Merge to `master` when ready for production.

| Component | AWS service | Public URL |
|-----------|-------------|------------|
| BFF + `/mcp` | Elastic Beanstalk | `https://<env>.elasticbeanstalk.com` |
| React UI | Amplify Hosting | `https://<branch>.<app-id>.amplifyapp.com` |

---

## Part 0 — CloudFront HTTPS (required for canvas to load)

Amplify and Trimble Assist are HTTPS. EB is HTTP by default. The browser blocks mixed-content requests (HTTPS page → HTTP API). Fix: put a free CloudFront distribution in front of EB.

1. [CloudFront Console](https://console.aws.amazon.com/cloudfront) → **Create distribution**
2. **Origin domain:** `Ai-dashboard-prod.eba-qpt2x3g2.us-east-1.elasticbeanstalk.com`  
   **Protocol:** HTTP only, port 80
3. **Default cache behavior:**
   - Viewer protocol: **Redirect HTTP to HTTPS**
   - Cache policy: **CachingDisabled**
   - Origin request policy: **AllViewer**
4. WAF: disable
5. **Create** → wait ~5 min → copy the `dXXX.cloudfront.net` domain

After deploy, update:
- **EB environment properties:** `BFF_PUBLIC_URL = https://dXXX.cloudfront.net`
- **Amplify environment variables:** `VITE_API_BASE = https://dXXX.cloudfront.net`
- Rebuild + redeploy EB zip (`npm run bundle:eb` → Upload and deploy)
- Amplify auto-redeploys on the next push (or trigger manually)

---

## Part A — One-time AWS account setup

### 1. Create an IAM user for deploys (recommended)

1. AWS Console → **IAM** → **Users** → **Create user** (e.g. `ai-dashboard-deploy`).
2. Attach policy **AWSElasticBeanstalkFullAccess** (or a tighter custom policy for EB + S3 upload).
3. Create **Access key** → copy **Access key ID** and **Secret access key**.

For **GitHub Actions** (optional, after EB exists):

- Repo → **Settings** → **Secrets** → add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

For **Amplify**, you usually connect GitHub in the console (no IAM keys in the repo).

---

## Part B — Elastic Beanstalk (BFF)

### 2. Create the application and environment

1. Open [Elastic Beanstalk](https://console.aws.amazon.com/elasticbeanstalk).
2. **Create application**
   - Application name: `ai-dashboard`
3. **Create environment**
   - Environment name: `ai-dashboard-prod` (must match `.github/workflows/deploy-bff.yml` or change the workflow)
   - Platform: **Web server** → **Node.js 22** on Amazon Linux 2023 (preferred; Node.js 20 may show as deprecated in the console but still works)
   - Application code: **Upload your code** (first time only — see zip below)
   - Presets: **Single instance (free tier eligible)** if offered, or **t2.micro** / **t3.micro**

#### Step 2 in the wizard: Configure service access (required)

If **EC2 instance profile** is empty and shows *"EC2 instance profile is required"*:

**Option A — Create from the wizard (easiest)**

1. Next to **EC2 instance profile**, click **Create role** (opens IAM in a new tab).
2. **Trusted entity:** AWS service → **Elastic Beanstalk** → use case **Elastic Beanstalk environment** (or **EC2** if that’s what the wizard offers).
3. Attach these **managed policies** (AWS often pre-selects them):
   - `AWSElasticBeanstalkWebTier`
   - `AWSElasticBeanstalkWorkerTier`
   - `AWSElasticBeanstalkMulticontainerDocker`
4. Role name: `aws-elasticbeanstalk-ec2-role` (or any name you prefer).
5. Create the role, return to the EB tab, refresh the **EC2 instance profile** dropdown, and select that role.

**Option B — IAM console**

1. [IAM → Roles → Create role](https://console.aws.amazon.com/iam/home#/roles/create)
2. **Trusted entity:** AWS service → **EC2**
3. Attach: `AWSElasticBeanstalkWebTier` (minimum for a web app).
4. Name: `aws-elasticbeanstalk-ec2-role` → **Create role**.
5. In EB, select it under **EC2 instance profile**.

**Service role** (top field): use **`aws-elasticbeanstalk-service-role`** if the dropdown offers it. If you only see `aws-elasticbeanstalk-ec2-role` in both fields, create the service role too:

- IAM → Create role → trusted entity **Elastic Beanstalk** → attach `AWSElasticBeanstalkEnhancedHealth` and `AWSElasticBeanstalkManagedUpdatesCustomerRolePolicy` → name `aws-elasticbeanstalk-service-role`.

**EC2 key pair:** optional (only for SSH into the instance). You can leave it blank.

Then click **Next** through the remaining steps (you can skip optional networking/database) → **Submit**.

### 3. First manual deploy (zip upload)

From repo root:

```bash
npm run bundle:eb
```

This creates **`bff-deploy.zip`** at the repo root. Upload it when creating the environment (or **Upload and deploy** on the environment page).

### 4. Environment properties (required)

Environment → **Configuration** → **Updates, logging, and monitoring** → **Software** → **Edit** → **Environment properties**:

| Name | Example / notes |
|------|-----------------|
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `BFF_PUBLIC_URL` | `https://ai-dashboard-prod.us-east-1.elasticbeanstalk.com` (your real EB URL, no trailing slash) |
| `TRIMBLE_AGENT_BASE_URL` | `https://agents.ai.trimble.com` |
| `DEMO_PLANNER_AGENT_ID` | Your orchestrator agent UUID |
| `WORKFLOW_BUILDER_AGENT_ID` | Your workflow builder UUID |
| `CLIENT_ID` | Trimble OAuth client id |
| `CLIENT_SECRET` | Trimble OAuth client secret |
| `TRIMBLE_AGENT_API_KEY` | Optional user JWT; if valid, machine token refresh is skipped |

**After Amplify is live**, add:

| Name | Value |
|------|--------|
| `UI_PUBLIC_URL` | `https://main.d1234abcd.amplifyapp.com` (your Amplify URL) |

Click **Apply** and wait for the environment to restart.

### 5. Verify BFF

```bash
curl -sS https://<your-eb-host>/api/health
curl -sS -X POST https://<your-eb-host>/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

MCP URL for Assist: **`https://<your-eb-host>/mcp`**

---

## Part C — Amplify (React UI)

### 6. Connect GitHub and deploy

1. Open [AWS Amplify](https://console.aws.amazon.com/amplify).
2. **Create new app** → **Host web app**.
3. **GitHub** → authorize → select repo **`ElishaSamPeterPrabhu/AI-Dashboard`** → branch **`feature/mcp-apps-canvas`** (test branch before merging to `master`).
4. Amplify detects **`amplify.yml`** at the repo root (build: `npm ci` + `npm run build`, output `dist/`).
5. **Environment variables** (Amplify → App → **Environment variables**):

   | Name | Value |
   |------|--------|
   | `VITE_API_BASE` | `http://<your-eb-host>` (same as BFF, **no** trailing slash; use your Elastic Beanstalk domain) |

6. **Save and deploy**. Note the app URL, e.g. `https://main.d1234abcd.amplifyapp.com`.

### 7. Point BFF at the UI (MCP App iframe)

Back in **Elastic Beanstalk** → environment properties, set:

- `UI_PUBLIC_URL` = your Amplify URL (no trailing slash)

Apply and wait for restart.

---

## Part D — Trimble Assist Stage (MCP Apps)

MCP Apps need a **public HTTPS** BFF and UI (Parts B + C above).

1. Open [https://assist.stage.trimble-ai.com](https://assist.stage.trimble-ai.com).
2. Settings → **MCP / Tools** (or Integrations).
3. Add MCP server: **`https://<your-eb-host>/mcp`** (not `/api/mcp`).
4. Assist runs `initialize` → `tools/list` → discovers **`build_workflow`** (with MCP App UI) and **`execute_workflow`**.
5. In chat: *"Plan a sprint for team of 8, velocity 42"*.

**How rendering works**

- Tools declare `"_meta": { "ui": { "resourceUri": "ui://workflow-canvas" } }` (`build_workflow` and `execute_workflow`).
- Assist calls `resources/read` for that URI; your BFF returns HTML that iframes the Amplify UI (`UI_PUBLIC_URL`).
- Ensure **`UI_PUBLIC_URL`** on EB matches your Amplify URL or the canvas stays blank inside Assist.

**Smoke test (no Assist)**

```bash
curl -sS https://<eb-host>/api/health
curl -sS -X POST https://<eb-host>/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## Part E — GitHub Actions (optional auto-deploy BFF)

After EB app + env exist with the names above:

1. Add secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
2. Push to **`feature/mcp-apps-canvas`** with changes under `server/` — workflow **Deploy BFF to AWS Elastic Beanstalk** runs. (Change the branch in the workflow when you merge to `master`.)

To use different names, edit `EB_APPLICATION_NAME` and `EB_ENVIRONMENT_NAME` in `.github/workflows/deploy-bff.yml`.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| 502 / app not starting | EB logs → **Request logs**; confirm `Procfile` is `web: node dist/main.js` and zip contains `dist/`. |
| 403 from agent | Set `DEMO_PLANNER_AGENT_ID` + ensure JWT or `CLIENT_ID`/`CLIENT_SECRET` can run that agent. |
| MCP works but canvas blank in Assist | Set `UI_PUBLIC_URL` on EB to Amplify URL; redeploy EB. |
| CORS errors from UI | `UI_PUBLIC_URL` and `BFF_PUBLIC_URL` set; Amplify domain matches `*.amplifyapp.com` in CORS. |

---

## Quick reference

```text
Assist Stage  →  POST https://<eb-host>/mcp  (build_workflow)
BFF MCP App   →  iframe → UI_PUBLIC_URL/projects/p1/workflows/<id>?embed=1
Demo UI       →  https://<amplify-host>  (VITE_API_BASE → EB)
```
