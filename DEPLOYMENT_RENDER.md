# Deploying your Exam Analytics App to Render (For Free)

Since your Google Cloud Run permissions are restricted or blocked, **Render** is another fantastic, completely free, and widely popular cloud hosting alternative for hosting your full-stack Node.js (Vite + Express) application.

Render offers a **Free Instance Tier** designed for hobby projects and web services, which is perfect for this app.

---

## Step-by-Step Deployment Instructions

### Step 1: Export your code from Google AI Studio
1. In Google AI Studio, click **Export to ZIP** or link the project to your **GitHub account** using the Settings menu.
2. If using ZIP, extract the files and upload the directory to a new public or private repository on your **GitHub account**.

### Step 2: Sign up on Render
1. Visit [https://render.com/](https://render.com/) and click **Sign Up**.
2. Sign up using your **GitHub account** (this makes importing your workspace incredibly easy).

### Step 3: Create a New Web Service on Render
1. On your Render Dashboard, click the **New +** button in the upper right.
2. Select **Web Service** from the dropdown menu.
3. Choose **Connect a repository** and select your newly created GitHub repository.

### Step 4: Configure your Web Service Settings
Render will auto-detect your `package.json` configurations. Assign the settings as follows:

* **Name**: `target-exam-practice-analytics` (or any custom identifier you like)
* **Region**: Choose the region closest to you (e.g., *Singapore* or *Oregon*)
* **Branch**: `main` (or whichever branch holds your code)
* **Instance Type**: Select **Free** ($0.00 / mo)
* **Runtime**: Select **Node**
* **Build Command**: `npm install && npm run build` 
  * *(This command installs all dependencies and triggers Vite and Esbuild to bundle both the client and server).*
* **Start Command**: `npm run start` (this runs `node dist/server.cjs`)

---

### Step 5: Configure Environment Variables
You need to provide your API secrets securely on Render's dashboard. Below the configuration inputs, click **Advanced** -> **Add Environment Variable**:

1. **`NODE_ENV`**: `production`
2. **`PORT`**: `10000` *(Render binds to private port 10000 by default, or sets its own. Our server code is already updated to dynamically adapt to whatever port Render provides: `process.env.PORT || 3000`).*
3. **`GEMINI_API_KEY`**: Paste your Google AI Studio generative API key. This makes sure all dynamic MCQ parses, diagnostic builders, and AI Syllabus tools work instantly on your production app!

---

### Step 6: Deploy and Monitor Logs
1. Click **Create Web Service** at the bottom of the page.
2. Render will automatically fetch your code, build/bundle the frontend and backend, and spin up the Express server.
3. **Note on Free Tier**: Render's free tier services will spin down (sleep) after 15 minutes of inactivity. When a new visitor accesses the app, it will spin back up automatically within 40–50 seconds!

---

## Troubleshooting Checklist
* **Firebase DB Connectivity**: The database operates via your client-side config, meaning all metric syncing, user history tracking, and active exams will function right out of the box in the browser!
* **Fast Startups**: To bypass typescript overhead at launch, the deployment uses `node dist/server.cjs` which loads instantly on Render instances.
