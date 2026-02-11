# Cricket Auction Monitor

A comprehensive web-based application designed to manage and streamline player auctions for cricket tournaments. This tool facilitates the entire auction process, from player registration and team setup to real-time bidding and budget tracking.

## Features

-   **Tournament Setup**: Configure tournament details, team count, and squad limits.
-   **Team Management**: set up team names, managers, and pre-assigned "Icon Players".
-   **Player Pool**: Register players or auto-generate a pool for testing.
-   **Real-time Dashboard**:
    -   Live budget tracking.
    -   Squad completion status.
    -   Spotlight view for current player bidding.
-   **AI Analysis**: (Optional) Basic analysis of team spending and squad balance.
-   **Public View**: Read-only display for big screens or projectors.

## Tech Stack

-   **Frontend**: HTML5, CSS3, Vanilla JavaScript.
-   **Backend**: Python (Flask).
-   **Database**: SQLite.

## Setup & Running

1.  **Prerequisites**:
    -   Python 3.x installed.

2.  **Start the Server**:
    -   Double-click `start_server.bat` (Windows).
    -   **OR** run via terminal:
        ```bash
        pip install flask flask-cors
        python backend/app.py
        ```

3.  **Access the App**:
    -   Open your browser and navigate to `index.html` (or letting the script open it).

## License

[MIT](https://choosealicense.com/licenses/mit/)
