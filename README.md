# Helix: Your Private, Offline AI Coding Assistant

Helix is a futuristic, offline-first AI code assistant designed to run entirely on your local machine. It features a bold, Jarvis-style interface and a powerful suite of tools, including a multi-file code editor, a rich-text notes pad, and live web search capabilities, all powered by local LLMs through Ollama.

---

![Helix Screenshot](https://i.imgur.com/k2e4b3J.jpeg)

## 🚀 Core Features

-   **100% Offline & Private**: Your code and conversations never leave your device. Powered by [Ollama](https://ollama.ai).
-   **Integrated Workspace**: A seamless, resizable split-pane view with Chat, a Code Editor, and a Notes Editor working together.
-   **AI-Powered Code Editor**: A multi-tab editor with syntax highlighting for various languages. You can ask Helix to review, refactor, or explain your code directly from the editor.
-   **Rich-Text Notes Editor**: A scratchpad for your thoughts, plans, and documentation. Use the `/notes` command to quickly create new notes, and ask Helix to summarize or improve them.
-   **Live Web Search**: Grant Helix access to the internet for up-to-the-minute information. Using the `/search` command, the AI can answer questions about recent events, new technologies, or documentation.
-   **Persistent Memory & Roles**: Teach Helix facts about you or your project (e.g., `framework=React`) that persist across sessions. You can also assign a specific role to the AI for the duration of a single chat (e.g., "Act as a senior database architect").
-   **Multi-Model Support**: Easily switch between any Ollama models you have installed. The UI provides helpful hints and power-level indicators for suggested models.
-   **Futuristic UI**: A neon, glassmorphic, and animated interface that makes coding feel like you're in a sci-fi movie.

---

## 🛠️ Setup and Installation

Follow these steps to get Helix up and running on your machine.

### Prerequisites

-   **Node.js**: You must have Node.js version 18 or higher. We recommend using [nvm](https://github.com/nvm-sh/nvm) to manage Node versions.
-   **Ollama**: The Ollama service must be installed and running.

### Step 1: Install Ollama & Download Models

1.  **Download and install Ollama** for your operating system from the official site: [https://ollama.ai/download](https://ollama.ai/download)

2.  After installing, Ollama will be running in the background. Open your terminal and pull the recommended models. This is a **one-time download** that saves the models permanently on your machine.
    ```bash
    ollama pull deepseek-coder:33b
    ollama pull qwen2:7b-instruct
    ollama pull llama3:8b
    ollama pull mistral:7b-instruct
    ```
3.  You can verify your installed models at any time by running:
    ```bash
    ollama list
    ```

### Step 2: Clone the Repository

Clone the Helix project to your local machine.
```bash
git clone [https://github.com/your-username/helix-ai-coder.git](https://github.com/your-username/helix-ai-coder.git)
cd helix-ai-coder
```

### Step 3: Install Dependencies

Helix has two parts: the frontend (the React app) and the backend (the server). You need to install dependencies for both.

1.  **Install Frontend Dependencies** (from the root directory):
    ```bash
    npm install
    ```
2.  **Install Backend Dependencies**:
    ```bash
    cd server
    npm install
    npm install cheerio # Required for the Web Search feature
    cd ..
    ```

### Step 4: Configure the API URL

In the project's **root** folder, create a new file named `.env` and add the following line. This tells the frontend where to find the backend server.

```env
REACT_APP_API_BASE=[http://127.0.0.1:4000](http://127.0.0.1:4000)
```

---

## ▶️ Running the Application

You will need **two separate terminal windows** to run both the backend and frontend servers simultaneously.

### 1. Start the Backend Server

In your first terminal, navigate to the `server` directory and start the server.
```bash
cd server
npm run server
```
You should see a confirmation message:
```
[helix-backend] listening on [http://127.0.0.1:4000](http://127.0.0.1:4000)
```
Leave this terminal window running.

### 2. Start the Frontend Application

In your second terminal, from the **root** directory, start the React development server.
```bash
npm start
```
The application will automatically open in your web browser at `http://localhost:3000`.

---

## 🎛️ How to Use Helix: A Feature Guide

### The Workspace

The main interface is a split-pane view. You can drag the divider between the **Chat** pane and the **Workspace** pane to resize them. The Workspace can be switched between the Code Editor, Notes Editor, or hidden completely.

### 🔎 Web Search

Give Helix access to live information from the web.
-   **How to use**: Type `/search` followed by your question in the chat prompt.
-   **Example**: `/search What is the latest version of React?`
-   **What it does**: Helix fetches the top web search results, reads them, and synthesizes a single, comprehensive answer, citing its sources with clickable links.

### 📝 Notes Editor

A rich-text editor for brainstorming, creating documentation, or drafting long-form text.
-   **How to create a note**: Type `/notes` in the chat. You can optionally give it a title.
-   **Example**: `/notes My Project Plan`
-   **Features**:
    -   Use the toolbar for formatting (bold, lists, headings, etc.).
    -   Click **"Insert to Chat"** to send the content of your note to the AI.
    -   Click **"Ask Helix"** to get feedback, suggestions, or a summary of your note.

### 💻 Code Editor

A multi-file code editor with syntax highlighting and file management.
-   **Features**:
    -   Create new files, open files from your disk, and save files.
    -   Language is automatically detected from the file extension (e.g., `.js`, `.py`).
    -   Click **"Insert to Chat"** to add the current file's code to your conversation.
    -   Click **"Ask Helix"** to get a full code review, find bugs, or ask for improvements.

### 🧠 Memory & Roles

Give the AI context that it can remember.
-   **Memory**: Click "Memory Show" to open the Memory dock. You can add key-value facts about yourself or your project (e.g., `username=Vedansh`, `language=TypeScript`). This memory persists across all chats.
-   **AI Role**: In the Memory dock, you can assign a temporary role to the AI for the current conversation only. This is perfect for giving specific instructions.
    -   **Example**: `You are a helpful tutor who explains complex topics simply.`

---

## 💡 Troubleshooting

If you encounter an error, check here for a common fix.

**Error: `Search failed: No route for POST /api/search`**
-   **Cause**: Your backend server is running old code that doesn't have the search feature.
-   **Fix**: Stop your backend server (`CTRL + C`) and restart it (`npm run server`).

**Error: `Cannot find package 'cheerio'`**
-   **Cause**: A required backend dependency is missing.
-   **Fix**: Stop your backend server and run `cd server && npm install cheerio`, then restart the server.

**Error: `Couldn't read installed models. Got HTML from server...`**
-   **Cause**: Your frontend cannot reach the backend or Ollama.
-   **Fix**:
    1.  Ensure your `.env` file is configured correctly.
    2.  Verify your backend server is running on the correct port (`4000`).
    3.  Make sure the main Ollama service is running on your machine (`ollama list` should work in your terminal).

---

## 📜 License

This project is licensed under the MIT License.