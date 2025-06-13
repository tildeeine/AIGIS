
import act.api
import json
import logging


class TypeManager:
    def __init__(self, baseurl="http://localhost:8080"):
        # Store the baseurl as an instance variable
        self.baseurl = baseurl
        self.config = act.api.Act(baseurl, user_id=1, log_level="debug")
        self.default_validator = "^.*$" # should allow anything

        self.object_type_ids = {}  
        self.object_types = {}     
        self.fact_types = {}       
        self.handler_types = {}    

        self.object_type_path = "./types/object-types.json"
        self.fact_type_path = "./types/fact-types.json"
        self.metafact_path = "./types/meta-fact-types.json"
        self.handler_path = "./types/handler-types.json"
        
        # Populate types after initialization
        self.populate_object_types() 
        self.populate_fact_types()
        self.populate_metafact_types()
        self.populate_handler_types()
    
    def populate_object_types(self):
        """
        Adds all required obj types to the ACT platform, loading definitions from object-types-imc.json.
        """
        logging.info("Registering necessary object types...")

        try:
            with open(self.object_type_path) as f:
                obj_types = json.loads(f.read())
        
            for obj_entry in obj_types:
                obj_type = obj_entry["name"]
                try:
                    # Add the object type
                    self.config.object_type(obj_type).add()
                    logging.debug(f"Added object type: {obj_type}")

                        
                except Exception as e:
                    if "already exists" not in str(e):
                        logging.warning(f"Error registering object type {obj_type}: {e}")
                    if "already exists" in str(e):
                        logging.debug(f"Object type {obj_type} already exists")
                    else:
                        logging.warning(f"Error adding object type {obj_type}: {e}")

        except FileNotFoundError:
            logging.error(f"Could not find {self.object_type_path} file")
            return 
        except json.JSONDecodeError as e:
            logging.error(f"Invalid JSON in {self.object_type_path}: {e}")
            return 
        except Exception as e:
            logging.error(f"Error processing object types: {e}")
            return 

    
    def populate_fact_types(self):
        """
        Adds all required fact types to the ACT platform, loading definitions from fact-types-imc.json.
        """
        logging.info("Registering necessary fact types...")
        
        try:
            with open(self.fact_type_path) as f:
                fact_types_data = json.loads(f.read())
                
            logging.debug(f"Loaded {len(fact_types_data)} fact types from file")
                
            # Register each fact type from the file
            for fact_type_def in fact_types_data:
                try:
                    name = fact_type_def["name"]
                    
                    # Convert objectBindings to relevantObjectBindings as expected by the API
                    relevant_object_bindings = []
                    if "objectBindings" in fact_type_def:
                        for binding in fact_type_def["objectBindings"]:
                            relevant_object_bindings = [{
                                    "destinationObjectType": binding["destinationObjectType"],
                                    "sourceObjectType": binding["sourceObjectType"]
                            }]

                            # Nov validators added yet, None for now
                            self.config.create_fact_type(name, self.default_validator, relevant_object_bindings)
                
                except Exception as e:
                    if "already exists" in str(e):
                        logging.debug(f"Fact type {fact_type_def['name']} already exists")
                    else:
                        logging.warning(f"Error adding fact type {fact_type_def['name']}: {e}")
        
        except FileNotFoundError:
            logging.error(f"Could not find {self.fact_type_path} file")
        except json.JSONDecodeError as e:
            logging.error(f"Invalid JSON in {self.fact_type_path}: {e}")
        except Exception as e:
            logging.error(f"Error processing fact types: {e}")


    def populate_metafact_types(self):
        """
        Adds all required metafact types to the ACT platform, loading definitions from metafact-types-imc.json.
        """
        logging.info("Registering necessary metafact types...")
        
        try:
            with open(self.metafact_path) as f:
                metafact_types_data = json.loads(f.read())
                
            logging.debug(f"Loaded {len(metafact_types_data)} metafact types from file")
                
            # Register each metafact type from the file
            for metafact_type_def in metafact_types_data:
                try:
                    name = metafact_type_def["name"]

                    fact_types = metafact_type_def.get("relevantFactTypeBindings", [])
                    logging.debug(f"Found related fact types: {fact_types} for metafact type {name}") 

                    self.config.create_meta_fact_type(name, fact_types)

                except Exception as e:
                    if "already exists" in str(e):
                        logging.debug(f"Fact type {metafact_type_def['name']} already exists")
                        self.fact_types[metafact_type_def['name']] = True  # Still store it if it exists
                    else:
                        logging.warning(f"Error adding fact type {metafact_type_def['name']}: {e}")
                
        except FileNotFoundError:
            logging.error(f"Could not find{self.metafact_path} file")
        except json.JSONDecodeError as e:
            logging.error(f"Invalid JSON in {self.metafact_path}: {e}")
        except Exception as e:
            logging.error(f"Error processing fact types: {e}")
    
    def populate_handler_types(self):
        """ 
        Loads handler types set in the handler-types-imc.json file. 
        """
        try:
            with open(self.handler_path) as f:
                self.handler_types = json.loads(f.read())
        except FileNotFoundError:
            logging.error(f"Could not find {self.handler_path} file")
        except json.JSONDecodeError as e:
            logging.error(f"Invalid JSON in {self.handler_path}: {e}")
        except Exception as e:
            logging.error(f"Error processing handler types: {e}")

class FactPusher:
    def __init__(self, typeManager, baseurl = "http://localhost:8080"):
        self.config = act.api.Act(baseurl, user_id=1, log_level="warning")

        self.interesting_types = [ "network_events", "process_events", "file_events", "registry_events"] 
        self.fact_value_counter = -1 #used to create unique fact values, instead of timestamp to make fuzzy search work. prob not the best solution, workaround

        self.handler_types = typeManager.handler_types


    def handle_generic(self, event: dict):
        """
        Creates facts from handlers for generic object types        
        """
        try:
            # Standardize field names across data sources
            self._standardize_field_names(event)

            # Normalize case for key fields
            self._normalize_case_sensitive_fields(event)

            # Process object based on its type
            event_type = event["type"]
            if event_type in self.handler_types:
                self._create_fact_from_handler(event, event_type)
        
        except act.api.base.ValidationError as e:
            print(f"Error (generic handler): {e} when adding {event}")

    def handle_access(self, event: dict):
        """
        Creates facts from handlers for event types that can be either read or write        
        """
        try:
            logging.debug(f"Processing read/write fact: {json.dumps(event)}")

            # Standardize field names across data sources
            self._standardize_field_names(event)

            # Normalize case for key fields
            self._normalize_case_sensitive_fields(event)

            # Process object based on its event type and access type
            event_type = event["type"]
            access_type = event["operation"]
            event_type = f"{event_type}_{access_type}"

            if event_type not in self.handler_types:
                logging.debug(f"Event type {event_type} not in handler_types")
                return
            if access_type not in ["read", "write"]:
                logging.debug(f"Access type {access_type} not in ['read', 'write']")
                return
            
            self._create_fact_from_handler(event, event_type)
        
        except act.api.base.ValidationError as e:
            print(f"Error (access handler): {e} when adding {event}")

    def _standardize_field_names(self, event: dict):
        """Standardize field names across different data sources."""
        field_mappings = [("source", "sourceScript")]
        
        for original, standard in field_mappings:
            if original in event:
                event[standard] = event[original]
                event.pop(original)

    def _normalize_case_sensitive_fields(self, event: dict):
        """Convert case-sensitive fields to lowercase for consistency."""
        case_sensitive_fields = ["hostname", "host", "username", "user"]
        
        for field in case_sensitive_fields:
            if field in event and isinstance(event[field], str):
                event[field] = event[field].lower()

    def _get_fact_value(self, event: dict, event_type: str):
        """Get the value for the fact based on the handler configuration."""
        fact_value = str(self.fact_value_counter)
        self.fact_value_counter -= 1
        if event_type == "process_events":
            fact_value = str(event["process_name"]) + "-" + fact_value
        elif event_type == "network_events":
            logging.debug(f"Event: {event}")
            fact_value = str(event["dest_ip"]) + "-" + str(event["src_ip"])+ "-" + str(event["dest_port"]) + "-" + str(event["proto"]) + "-" + fact_value 
        return fact_value

    def _create_fact_from_handler(self, event: dict, event_type: str):
            """Create a fact in ACT based on handler configuration."""
            try:
                handler = self.handler_types[event_type]

                # Special case for root process
                if (event_type == "process_events" and event[handler["source_field"]] == 0):
                    event[handler["source_field"]] = "root"
                # Special case for network events with process ID 0
                if (event_type == "network_events" and event[handler["source_field"]] == 0):
                    event[handler["source_field"]] = "root"
                fact = (
                    self.config.fact(handler["fact_type"])
                    .source(handler["source_type"], event[handler["source_field"]])
                    .destination(handler["destination_type"], event[handler["destination_field"]])
                )

                fact.value = self._get_fact_value(event, event_type)

                logging.debug(f"Creating fact: {fact.json()}")

                new_fact = fact.add() 

                # Add metadata to the fact
                self._add_metadata_to_fact(event, handler, new_fact)

            except KeyError as e:
                source_script = event.get("sourceScript", "Unknown script")
                object_type = event.get("type", "Unknown type")

                logging.warning(
                    f"Error using expected key {e} in {json.dumps(event)}. "
                    f"Source script ({source_script}) may need to be updated with correct "
                    f"fields for its type ({object_type}) as set in handler_types-imc.json"
                )

    def _add_metadata_to_fact(self, event: dict, handler: dict, fact: act.api.fact.Fact):
        """Add metadata to a fact based on handler configuration."""

        for field in event:
            if field not in handler["blacklist"]: 
                try:
                    logging.debug(f"Adding metadata: {field}={event[field]}")
                    fact.meta(field, str(event[field])).add()
                except Exception as e:
                    logging.error(f"Error adding metadata: {e}")

    def handle_object(self, event: dict):
        try:
            match event["type"]:
                case "process_events" | "network_events":
                    self.handle_generic(event)
                case "file_events" | "registry_events":
                    self.handle_access(event)
                case _:
                    print(f"{event['type']} not supported by ingest engine")
        except act.api.schema.MissingField as e:
            print(f"[!] Major error: {e} while processing {event}")

    def read_file(self, filename):
        """
        Reads a file containing JSON objects for facts in the ACT system, and adds them and their objects to the platform.
        """
        try:
            # Open and read the file
            with open(filename, 'r', encoding='utf-8') as f:
                data = json.load(f)

            results = data["analysisResult"]["sandbox"] #! works for this sandbox, but probably specific to this format output
            for event_type in self.interesting_types:
                for event in results[event_type]:
                    event["type"] = event_type
                    self.handle_object(event)

            logging.info(f"Completed processing all objects of types {self.interesting_types} from {filename}")


        except json.JSONDecodeError as e:
            logging.error(f"Invalid JSON in file {filename}: {e}")
        except Exception as e:
            logging.error(f"Error processing from file: {e}")                 
        except FileNotFoundError:
            logging.error(f"File not found: {filename}")
        except PermissionError:
            logging.error(f"Permission denied when accessing file: {filename}")



class Runner:
    def __init__(self, baseurl="http://localhost:8080"):
        self.config = act.api.Act(baseurl, user_id=1, log_level="debug")

        self.type_manager = TypeManager()
        self.fact_pusher = FactPusher(self.type_manager, baseurl)

        self.fact_pusher.read_file("./malware-json/2.json") #! file used for testing 
    

if __name__ == "__main__":
    runner = Runner()