# Deploying your Exam Analytics App to Koyeb (For Free)

Since your Google Cloud Run permissions are restricted or blocked, **Koyeb** is an exceptional, fast, and completely free alternative to host your full-stack Node.js (Vite + Express) application. 

Koyeb offers a free web service tier ($5.50/month in free credits which forever covers 1 Nano instance of 512MB RAM) which is perfect for this application.

---

## Step-by-Step Deployment Instructions

### Step 1: Export your code from Google AI Studio
1. In Google AI Studio, look at the upper-right corner or the **Settings** menu.
2. Click **Export to ZIP** or **Export to GitHub** to load your current code repository.
3. If you exported a ZIP, extract it on your desktop and initialize a local Git repository, or upload the directory directly to a new repository on your **GitHub account**.

### Step 2: Sign up on Koyeb
1. Go to [https://www.koyeb.com/](https://www.koyeb.com/) and sign up.
2. Complete the onboarding wizard to activate your account. You will automatically receive the starter credit ($5.50/month) which is sufficient for one free application running 24/7.

### Step 3: Create a New App on Koyeb
1. In your Koyeb Dashboard, click the **Create Service** button.
2. Choose **GitHub** as your deployment source.
3. Connect your GitHub account and select your newly created repository (e.g., `target-exam-practice-analytics`).

### Step 4: Configure the Service
Koyeb's builder will automatically scan your `package.json` and recognize that you are using a Node.js full-stack application. Set the configuration options as follows:

* **Service Type**: Choose **Web Service**.
* **Branch**: Select your main branch (usually `main` or `master`).
* **Instance Type**: Select the **Nano** instance (512MB RAM, $0.00 / free-tier eligible).
* **Builder**: Set to **Node.js** (this is usually auto-detected).
* **Ports**: Under the Network tab:
  * Port: **`3000`**
  * Protocol: **HTTP**
  * Path: **`/`**  *(This configures Koyeb's reverse proxy to route public incoming HTTPS traffic to our server).*

### Step 5: Add Environment Variables
Scroll to the **Environment Variables** section and add the following keys:

1. **`NODE_ENV`**: Set to `production`
2. **`PORT`**: Set to `3000`
3. **`GEMINI_API_KEY`**: Paste your Google AI Studio generative API key. This makes sure all dynamic MCQ parses, diagnostic builders, and AI Syllabus tools work instantly on your production app!

### Step 6: Deploy!
1. Click **Deploy**.
2. Koyeb will download your code from GitHub, install dependencies, run `npm run build` (bundling the frontend and backend), and start `node dist/server.cjs`.
3. In 1–2 minutes, your deployment will change to **Active** and you'll receive a free secure URL (e.g., `https://your-app-name.koyeb.app`) to share with anyone!

---

## Troubleshooting & Key Features Solved:
* **Dynamic Ports**: Koyeb will automatically route Web requests using our updated dynamic port binding listener (`process.env.PORT || 3000`).
* **Firebase Sync**: The database operates via the client-side configuration synced to your Firebase Firestore project, meaning exam histories, syllabus states, and metrics sync flawlessly, directly in the user browser!
