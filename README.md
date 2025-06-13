# Grafeo Thesis Project

## Project Structure
Here is an overview of the project directory structure and contents:
```
malware_visualization/
├── README.md 
|── backend/             
|   ├── docker-compose.yml              # Docker setup file
|   ├── add_initial_data.py             # Adds initial data to ACT, run on first start                    
|   ├── api_bridge.py                   # Handles interactions between apiService and ACT API library using flask
|   ├── types/                          # Data type definitions
|   │   |── fact-types.json
|   │   |── meta-fact-types.json
|   │   |── object-types.json
|   │   └── handler-types.json
└── frontend/                           # Contains svelte+d3.js code for the frontend
    └── src/
        |── routes/
        |   └── +page.svelte            # Main code for frontend page
        |── lib/
            |── process-tree/           # Code only used for process tree view
            |── process-graph/          # Code only used for node graph view
            └── shared/                 # Code used for both views. Same structure as the other lib folders
            |── components/             # Svelte components
            |── models/                 # Handles data models for nodes, links, etc.
            └── services/               # Handles external services, like API, d3, etc.
                |── apiService.js    # Code for all api interactions from the frotend to the bridge api
                └── ...
```

## Quick start
Start the ACT backend

```bash
docker-compose up -d
```

Start the API bridge

```bash
cd backend
python api_bridge.py
```

Start the frontend (svelte)

```bash
cd frontend
npm run dev
``` 

Add initial data to the application

```bash
cd backend
python add_initial_data.py
```
Go to http://localhost:5173/ to see the frontend. 
NB! The port in use may change, and could be 5174, 5175, etc. Check the output from the terminal you started the frontend in to see the right port to use. The port in the api_bridge.py file has to match the port being used frontend.

Swagger API documentation can be found at http://localhost:8080/swagger/.

To destroy the docker containers and get them to start fresh next time, you can use
```bash
docker-compose down --volumes
```

NOTE: Adding initial data may take a few minutes, depending on the size of the malware-json file in use. 

NOTE: Which malware-json file to load from is currently hardcoded in `add_initial_data.py`, in the `self.fact_pusher.read_file()` method. 

NOTE: If you get `502 Bad Gateway` issues when adding initial data to application, just wait a bit. This is usually because the ACT API is not fully up and running yet, which might take a few minutes. 


## Setup instructions 
### First setup

Create network

```bash
sudo docker network create cyberrisk
```

Import docker image tar.gz files
```bash
docker image load -i <filnavn>.tar.gz
```

Run the makefile
```bash
make up
```

### Cleanup

Remove all volumes

```bash
docker-compose down
```


## Adding fact and object types
Adding custom data types is done manually through the api, in the `add_initial_data.py` file. 

It is also possible to do this through changing the files in an imc folder, as referenced in the `docker-compose.yml` file, but we did not get this to work on setup so types are instead being manually added on first start. 

If using the imc folder, note that it is only loaded on first start, so for changes to fact or data types to take effect the docker containers must be taken down and re-built. 
