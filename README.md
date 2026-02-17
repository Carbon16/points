# Points PWA

The points PWA is a Progressive Web App with basic blockchain that allows users to track their points and play poker games with another user. I added a silly amount of over-engineering to this because why not.

## Features

- User authentication
- Point tracking
- Game playing
- Request approval system
- Identity backup and recovery
- Silly blockchain because I can

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
- Silly blockchain because I can

## Notes & Feedback

- If you want to open a pr, go for it I guess? All PRs must include a funny joke.
- If there's a issue -- open a issue (or fix it yourself). I will maybe get round to if it I have time. No one reads this far down anyway. I like frogs.

Ribbit.