# Grafeo Thesis Project

## Project Structure
Here is an overview of the project directory structure and contents:
```
malware_visualization/
├── README.md 
|── backend/             
|   ├── malware-json/                   # All malware json files used for testing of the platform
|   │   └── ...
|   ├── types/                          # JSON data type definitions for ACT objects and facts
|   │   |── fact-types.json
|   │   |── meta-fact-types.json
|   │   |── object-types.json
|   │   └── handler-types.json
|   ├── add_initial_data.py             # Script for adding malware execution data to ACT backend                  
|   ├── api_bridge.py                   # Flask app that bridges frontend with ACT API
|   └── docker-compose.yml              # Docker setup for ACT backend
└── frontend/                           # Svelte + D3.js frontend
    |── src/
    |   |── lib/
    |   |   |── bookmarks/              # Bookmarks functionality
    |   |   |── process-graph/          # Event graph visualization
    |   |   |── process-tree/           # Process tree visualization
    |   |   |── shared/                 # Shared utilities and components
    |   |   |   |── components/     
    |   |   |   |── constants/                     
    |   |   |   |── models/                 
    |   |   |   |── services/           # API and D3 service logic
    |   |   |   |    |── apiService.js  # API interactions
    |   |   |   |    └── ...
    |   |   |   └── stores/
    |   |   └── timeline/               # Timeline visualization
    |   └── routes/
    |      └── +page.svelte            
    └── ...
```

## Quick start
Start the ACT backend using Docker:

```bash
docker-compose up -d
```

Start the Flask API bridge:

```bash
cd backend
python api_bridge.py
```

Start the frontend:

```bash
cd frontend
npm run dev
``` 

Add malware run data to the backend:

```bash
cd backend
python add_initial_data.py
```
Visit the frontend at http://localhost:5173/.
NB! The port in use may change. Check your terminal output to confirm which port is in use. The Flask API bridge needs to use the same port.

Swagger API documentation for ACT: http://localhost:8080/swagger/.

To reset containers and data:
```bash
docker-compose down --volumes
```

NOTE: Which malware-json file to load from is currently hardcoded in `add_initial_data.py`, in the `self.fact_pusher.read_file()` method. 


## First-Time Setup

If running the backend from a pre-packaged environment of ACT:

1. Create Docker network:
```bash
sudo docker network create cyberrisk
```

2. Load the images:
```bash
docker image load -i <filename>.tar.gz
```

3. Start services using Makefile:
```bash
make up
```

## Adding Fact and Object Types

Custom types for the platform are currently added manually via the `backend/add_initial_data.py` script.

It should also be possible to load these from the `types` directory files, but note:

- This is only loaded on first startup
- Any changes to types via these files require a full teardown and rebuild:

```bash
docker-compose down --volumes
docker-compose up -d
```

## Known issues / Limitations

- Data loading may result in 502 errors if the ACT backend is still initializing. Wait and retry if you get 502 errors. 
- The platform only supports uploading sandbox execution results on the format shown in `backend/malware-json` files
- The platform is tailored for results of Windows executables. Other OS results can be uploaded, but may cause unexpected issues.
- Not optimized for production. Expect limited error handling, scalability, and modularity.

## Dependencies
- [Svelte](https://svelte.dev/)
- [npm](https://www.npmjs.com/)
- [D3.js](https://d3js.org/)
- [Flask](https://flask.palletsprojects.com/en/stable/)
- [Grafeo (ACT) ](https://github.com/mnemonic-no/grafeo)
- [act-api](https://pypi.org/project/act-api/)

## License
This code is part of a university research project for a master's thesis, and is shared under the [MIT License](https://opensource.org/license/mit). 

## About the project
This prototype was developed as part of a master's thesis at NTNU Trondheim. For more information, you can read the thesis here: (link to be added).