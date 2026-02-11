# Cricket Auction Monitor

> **A professional-grade, web-based auction management system for cricket tournaments.**

The **Cricket Auction Monitor** is a full-stack web application designed to simulate and manage the high-pressure environment of a live cricket player auction. Whether you are running a local league, a college tournament, or a fun simulation with friends, this tool handles the math, the clock, and the team management so you can focus on the bidding.

## 🚀 Key Features

### 🏆 Tournament Setup
-   **Flexible Configuration**: Set your own budget caps (purse), squad size limits, and base prices.
-   **Team Management**: Create custom teams with unique names and assign team managers.
-   **Icon Players**: Pre-assign star players to teams before the auction starts, deducting from the squad limit but not the purse (or as configured).

### 👥 Player Management
-   **Bulk Registration**: Add hundreds of players to the auction pool.
-   **Auto-Fill Function**: Quickly generate dummy players for testing or simulation.
-   **Role & Stats (Future)**: *Extensible design allows for adding player roles (Batsman, Bowler) and stats.*

### ⚡ Live Auction Dashboard
-   **Real-Time Bidding**: Track the "Current Bid" and the "Leading Team".
-   **Spotlight View**: Focused display for the player currently being auctioned.
-   **Smart Shuffling**: Randomly picks unsold players for the next round.
-   **Unsold Handling**: Mark players as unsold and bring them back in later rounds.
-   **Budget Tracking**: Live updates of every team's remaining purse and squad slots.

### 🧠 AI Analysis (Beta)
-   **Smart Insights**: Python-powered backend analyzes team spending patterns.
-   **Risk Assessment**: Warns if a team is spending too fast ("High Risk") or saving too much ("Saver").
-   **Strategic Labels**: Tags teams as "Aggressive", "Balanced", or "Smart Buy" based on their fill rate vs. spending rate.

### 🌐 Public View
-   **Projector Mode**: A separate, read-only page (`public_teams.html`) optimized for big screens.
-   **Live Sync**: Updates instantly as changes happen on the admin dashboard.

---

## 🛠️ Technology Stack

-   **Frontend**:
    -   **HTML5 / CSS3**: Custom responsive design with a modern, glassmorphism aesthetic.
    -   **Vanilla JavaScript**: robust state management without the overhead of heavy frameworks.
-   **Backend**:
    -   **Python (Flask)**: Serves the application and handles API logic.
    -   **SQLite**: Lightweight, file-based database for simple data persistence.
    -   **Gunicorn**: Production-grade WSGI server for deployment.

---

## ⚙️ Installation & Setup

### Prerequisites
-   Python 3.x installed on your system.
-   Git (optional, for cloning).

### Local Run (Windows)
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/aprasad098765/Cricket-Auction-Monitor.git
    cd Cricket-Auction-Monitor
    ```
2.  **Start the Server**:
    -   Simply double-click the `start_server.bat` file.
    -   *Or run via command line:*
        ```bash
        pip install -r requirements.txt
        python backend/app.py
        ```
3.  **Access the App**:
    -   Open `http://localhost:5000` in your browser.

### Cloud Deployment (Render)
This project is configured for one-click deployment on Render.
1.  Push your code to GitHub.
2.  Create a new **Web Service** on Render.
3.  Connect your repository.
4.  Use `gunicorn backend.app:app` as the Start Command.
5.  *No environment variables required!*

---

## 📖 Usage Guide

1.  **Create Tournament**: Enter a name (e.g., "IPL 2026") and set the number of teams.
2.  **Register Players**: Add player names manually or use "Auto-Fill" for a quick start.
3.  **Configure Rules**: Set the "Total Purse" (e.g., 50 Cr) and "Base Price" (e.g., 20 Lakhs).
4.  **Name Teams**: Give each team a name (e.g., "Mumbai Indians", "CSK") and assign any Icon Players.
5.  **Auction Time**:
    -   Click **"Shuffle Player"** to pick a random player.
    -   Accept bids from teams.
    -   Assign the player to the winning team at the closing price.
    -   Watch the **Leaderboard** update instantly.
6.  **Summary**: Once all players are sold or teams are full, view the final summary.

---

## 📂 Project Structure

```
├── backend/            # Python backend logic
│   ├── app.py          # Main Flask application
│   └── __init__.py     # Package marker
│
├── static/             # (Served from root)
│   ├── style.css       # Main stylesheet
│   ├── script.js       # Core frontend logic
│   └── *.html          # UI Views (setup, dashboard, etc.)
│
├── auction.db          # SQLite database (auto-created)
├── requirements.txt    # Python dependencies
├── Procfile            # Deployment configuration
└── start_server.bat    # Windows startup script
```

## 📄 License

This project is open-source and available under the [MIT License](https://choosealicense.com/licenses/mit/).
