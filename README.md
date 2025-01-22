# Web-Based BIM-Viewer 

## Overview
A powerful web-based BIM (Building Information Modeling) viewer that combines IFC model visualization. Built with Three.js and TypeScript, this application offers advanced features for architectural visualization and model interaction.

## Features
- 🏗️ IFC Model Visualization
- 🕶️ Virtual Reality Support (WIP!)
- 📏 Measurement Tools
- ☁️ Point Cloud Integration (LAS/LAZ)
- 🔍 Element Search & Classification
- ✂️ Clipping Planes
- 📌 3D Annotations
- 🗺️ Minimap Navigation
- 📱 Responsive UI with Collapsible Panel

## Tech Stack
- Frontend:
  - TypeScript
  - Three.js
  - @thatopen/components (BIM Components)
  - WebXR for VR integration
  - Vite

- Backend:
  - FastAPI (Python)
  - SSL for secure communication
  - socket
  - laspy für transforming pointclouds into las

## Prerequisites
- Node.js (v14 or higher)
- Python 3.8+
- SSL Certificate (for HTTPS)


The application will be available at https://localhost:5173
Usage

Upload IFC files using the "Import" panel
Use VR mode with compatible headsets (e.g., Meta Quest)
Add measurements with the measurement tool
Create annotations by clicking the "Add Annotation" button
Adjust clipping planes for section views
Navigate using the camera presets or minimap
Load and manipulate point cloud data

## Development

Frontend code is in TypeScript with Three.js
Backend uses FastAPI with file storage system
VR implementation uses WebXR
Secure communication over HTTPS

## Contributing
Contributions are welcome! Please feel free to submit pull requests.
## License
MIT License
## Contact
Simon Eric Korfmacher