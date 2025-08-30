Here’s an updated README so that **anyone** who clones your repo can get Helix running, with all the steps for backend, Ollama, and persistent models.

````markdown
# Helix: Offline AI Coding Assistant

A futuristic **offline AI code assistant** with a bold red cyber-robot interface.  
Built with **React**, **Prism.js**, and **pure CSS** for a Jarvis-style experience.

---

## 🚀 Features

- **Jarvis-Style UI** – Neon, glassmorphic, animated—feels like Tony Stark’s lab.
- **Local & Private** – Runs entirely on your device with [Ollama](https://ollama.ai) or any local API backend.
- **Chat to Code** – Type prompts, receive AI-generated code, view in collapsible, syntax-highlighted blocks.
- **Multi-Model Support** – Choose from installed models, with usage hints in the dropdown.
- **Customizable** – Change CSS, add commands, or connect different LLM/code models.

---

## 🛠️ Getting Started

### 1️⃣ Clone this repository
```bash
git clone https://github.com/yourusername/jarvis-coder.git
cd jarvis-coder

# set versions
npm pkg set react=18.2.0 react-dom=18.2.0

# clean & reinstall
rm -rf node_modules package-lock.json
npm i
npm i @uiw/react-codemirror@^4.23.8 @uiw/codemirror-theme-vscode@^4.23.8 \
      @codemirror/lang-javascript@^6 @codemirror/lang-python@^6 @codemirror/lang-markdown@^6

````

---

### 2️⃣ Install dependencies

**Frontend (React app):**

```bash
npm install
```

**Backend (Node/Express API wrapper):**

```bash
cd server
npm install
cd ..
```

---

### 3️⃣ Set API base URL

In the **root** folder, create a `.env` file:

```env
REACT_APP_API_BASE=http://127.0.0.1:4000
```

> The backend must run on the same port as above.

---

### 4️⃣ Install Ollama

Download and install Ollama from:
[https://ollama.ai/download](https://ollama.ai/download)

Once installed, Ollama runs a local API on `http://127.0.0.1:11434`.

---

### 5️⃣ Pull your models (permanent install)

Run these commands **once** to download and keep the models:

```bash
ollama pull deepseek-coder:33b
ollama pull qwen2.5:14b-instruct
ollama pull llama3.1:8b
ollama pull mistral:7b-instruct
ollama pull gemma:7b-instruct
ollama pull llama3.1:70b
```

> Models are stored locally and remain available even after restarting your PC.
> You can check them anytime:

```bash
ollama list
```

---

### 6️⃣ Start the backend server

```bash
cd server
node -v              # if < 18, upgrade
# with nvm
nvm install 20
nvm use 20

npm run server
```

It should print:

```
Server listening on http://127.0.0.1:4000
```

---

### 7️⃣ Start the frontend

In a separate terminal:

```bash
npm start
```

The app will open at `http://localhost:3000`.

---

## 🎛 Using the App

* **Select a model** from the dropdown. Installed models appear at the top.
* **Type your prompt** and press **Send**.
* View AI output with syntax highlighting and collapsible code blocks.
* Click **Refresh** to re-scan installed models.

---

## 📂 Project Structure

```
src/
  App.js            # Main React component
  Helix.css         # UI styles
  components/       # Optional reusable components
server/
  server.js         # Node/Express backend API
public/
  index.html
.env                # API base config
```

---

## 🔧 Customization

* **Theme:** Edit `Helix.css`.
* **Add models:** Update `MODEL_INFO` in `App.js`.
* **Backend URL:** Change `REACT_APP_API_BASE` in `.env`.

---

## 🖼️ Screenshot

![Helix Screenshot](screenshot.png)

---

## 📜 License

MIT License – free to use and modify.

---

## 💡 Troubleshooting

**Error:**

```
Couldn't read installed models. Got HTML from server. Check REACT_APP_API_BASE.
```

**Fix:**

* Ensure `.env` has the correct backend URL.
* Verify backend is running on that URL and port.
* Make sure Ollama service is running (`ollama list` should work).

---


