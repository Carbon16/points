# Points PWA

The points PWA is a Progressive Web App with basic blockchain that allows users to track their points and play poker games with another user. I added a silly amount of over-engineering to this because why not.

## Features

- User authentication
- Point tracking
- Game playing
- Request approval system
- Identity backup and recovery
- Silly blockchain because I can

## Manifest

```json
{
    "place": {
        "min": 1, 
        "max": 2,
        "cards": ["London", "Paris", "New York", "Tokyo"],
        "icon": "location-outline",
        "colour": "#3b82f6",
        "font": "sans-serif"
    },
    "etc": {
        etc...
    }
```

## Deployment

Stick it on a VPS with
```bash
# Clone the repo
git clone https://github.com/carbon16/points.git

# Navigate to the project directory
cd points

# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm run start
```
### Running as a service

Or if you want to do it properly with a service file:
```bash
# Clone the repo
git clone https://github.com/carbon16/points.git

# Navigate to the project directory
cd points

# Install dependencies
npm install

# Build the project
npm run build

# Copy the service file to /etc/systemd/system/
cp points.service.example /etc/systemd/system/points.service

# Reload systemd
systemctl daemon-reload

# Enable the service
systemctl enable points.service

# Start the service
systemctl start points.service
```

## Security

This is a PWA, so it's not going to be super secure. But I did add some security features:

- JWT authentication
- Password hashing
- Public key cryptography
- Request approval system
- Identity backup and recovery
- Silly blockchain because I can (Tamper-Evident Log)

## Trust & Integrity

To address concerns about sysadmin manipulation, this system implements:

### 1. Tamper-Evident Ledger (Blockchain)
- All point transactions are recorded in a **Linear Hash Chain** (a degenerate Merkle Tree).
- Each block contains the hash of the previous block (`prevHash`).
- Modifying any past block invalidates the hash chain, making tampering detectable.
- **Sysadmin Limit:** An admin can delete the database file, but cannot secretly modify a user's balance history without breaking the chain's integrity.

### 2. Non-Repudiation (Game Actions)
- Every critical game action (Bet, Check, Fold) is cryptographically signed by the user's private key (P-256 curve).
- The server stores these signatures in an immutable `game_actions` log.
- This provides mathematical proof of every move, preventing a corrupt server from fabricating game states.

### 3. Identity & Keys
- Private keys never leave the user's device (stored in IndexedDB/Secure Enclave).
- The server only holds Public Keys for verification.

## Notes & Feedback

- If you want to open a pr, go for it I guess? All PRs must include a funny joke.
- If there's a issue -- open a issue (or fix it yourself). I will maybe get round to if it I have time. No one reads this far down anyway. I like frogs.

Ribbit.