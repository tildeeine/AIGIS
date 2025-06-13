from flask import Flask, request, jsonify
import logging
import requests
import json
import act.api

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
# Connecting to api for logging

# API configs
ACT_API_URL = "http://localhost:8080"
ACT_API_HEADERS = {
    'Content-Type': 'application/json',
    'ACT-User-ID': '1' 
}

# # Add CORS headers to all responses to avoid CORS errors
@app.after_request
def add_cors_headers(response):
    response.headers.add('Access-Control-Allow-Origin', 'http://localhost:5173')  # Match your frontend port
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type, Authorization, ACT-User-ID')
    response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    return response

@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "healthy", "service": "act-bridge-api"})

# Options handler for all endpoints
@app.route("/v1/fact/search", methods=["OPTIONS"])
def options_fact_search():
    return "", 200

@app.route("/v1/object/uuid/<id>/facts", methods=["OPTIONS"])
def options_object_facts(id):
    return "", 200

@app.route("/v1/object/uuid/<id>", methods=["OPTIONS"])
def options_object_by_id(id):
    return "", 200

@app.route("/v1/fact/uuid/<id>/meta", methods=["OPTIONS"])
def options_fact_meta(id):
    return "", 200

def make_act_api_request(endpoint, method="GET", data=None):
    """
    Make a request to the ACT API and handle common error cases
    """
    url = f"{ACT_API_URL}{endpoint}"
    
    try:
        logger.debug(f"Making {method} request to {url}")
        
        if method.upper() == "GET":
            response = requests.get(url, headers=ACT_API_HEADERS)
        else:
            response = requests.post(url, json=data, headers=ACT_API_HEADERS)
                
        # Check if the request was successful
        if response.status_code != 200:
            logger.error(f"API request failed: {response.status_code} {response.text}")
            return {"error": f"API request failed: {response.status_code}"}, response.status_code
        
        # Parse the response
        result = response.json()
        logger.debug(f"Response data: {json.dumps(result)[:500]}...")  # Log first 500 chars
        return result, 200
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Request error: {str(e)}")
        return {"error": f"Request error: {str(e)}"}, 500
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {str(e)}")
        return {"error": f"Invalid JSON response: {str(e)}"}, 500
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return {"error": f"Unexpected error: {str(e)}"}, 500

@app.route("/v1/object/uuid/<id>/facts", methods=["POST"])
def get_object_facts(id):
    """
    Get facts for a specific object
    """
    try:
        request_data = request.get_json() or {}

        # Filter out empty parameters
        search_params = {k: v for k, v in request_data.items() 
                        if v not in [None, "", []] and k != "credentials"}
        
        # Make direct API call
        result, status_code = make_act_api_request(f"/v1/object/uuid/{id}/facts", "POST", search_params)
        
        if status_code != 200:
            return jsonify(result), status_code
        
        # Process and transform the results if needed
        if "data" in result:
            # Format each fact in the data array
            formatted_data = []
            for fact in result["data"]:
                formatted_fact = format_fact(fact)
                
                # Add metadata if applicable
                if "id" in fact:
                    meta_data, meta_status = get_fact_metadata(fact["id"])
                    if meta_status == 200 and "data" in meta_data and meta_data["data"]:
                        formatted_fact["meta"] = format_metadata(meta_data["data"])
                
                formatted_data.append(formatted_fact)
            
            result["data"] = formatted_data
        
        return jsonify(result)
    except Exception as e:
        logger.exception(f"Error getting object facts: {str(e)}")
        return jsonify({"error": f"Error getting object facts: {str(e)}"}), 500
        
@app.route("/v1/fact/search", methods=["POST"])
def search_facts():
    """
    Search for facts based on various criteria
    """
    try:
        request_data = request.get_json() or {}

        # Filter out empty parameters
        search_params = {k: v for k, v in request_data.items() 
                        if v not in [None, "", []] and k != "credentials"}
        
        # Make direct API call
        result, status_code = make_act_api_request("/v1/fact/search", "POST", search_params)
        
        if status_code != 200:
            return jsonify(result), status_code
        
        # Process and transform the results if needed
        if "data" in result:
            # Format each fact in the data array
            formatted_data = []
            for fact in result["data"]:
                formatted_fact = format_fact(fact)
                
                # Add metadata if applicable
                if "factId" in formatted_fact:
                    meta_data, meta_status = get_fact_metadata(formatted_fact["factId"])
                    if meta_status == 200 and "data" in meta_data and meta_data["data"]:
                        formatted_fact["meta"] = format_metadata(meta_data["data"])
                
                formatted_data.append(formatted_fact)
            
            result["data"] = formatted_data
            result["count"] = len(formatted_data)  # Update count to match actual data length
        
        return jsonify(result)
    except Exception as e:
        logger.exception(f"Error searching facts: {str(e)}")
        return jsonify({"error": f"Error searching facts: {str(e)}"}), 500

@app.route("/v1/fact/uuid/<id>/meta", methods=["GET"])
def get_fact_meta(id):
    """
    Get metadata for a specific fact
    """
    try:
        # Make direct API call
        result, status_code = make_act_api_request(f"/v1/fact/uuid/{id}/meta", "GET")
        
        if status_code != 200:
            return jsonify(result), status_code
        
        # Process and transform the results if needed
        if "data" in result:
            result["data"] = format_metadata(result["data"])
        
        return jsonify(result)
    except Exception as e:
        logger.exception(f"Error getting fact metadata: {str(e)}")
        return jsonify({"error": f"Error getting fact metadata: {str(e)}"}), 500

def get_fact_metadata(fact_id):
    """
    Helper function to get metadata for a fact
    """
    return make_act_api_request(f"/v1/fact/uuid/{fact_id}/meta", "GET")

def format_fact(fact):
    """
    Return a simplified version of the fact to frontend
    """
    if not fact:
        return None
    result = {
        "factId": fact.get("id"),
        "type": fact.get("type", {}).get("name") if isinstance(fact.get("type"), dict) else str(fact.get("type", "")),
        "timestamp": fact.get("timestamp"),
    }
    
    # Add source object info if available
    if "sourceObject" in fact and fact["sourceObject"]:
        source = fact["sourceObject"]
        result.update({
            "sourceObjectUid": source.get("id"),
            "sourceObjectType": source.get("type", {}).get("name") if isinstance(source.get("type"), dict) else str(source.get("type", "")),
            "sourceObjectValue": source.get("value")
        })
    
    # Add destination object info if available
    if "destinationObject" in fact and fact["destinationObject"]:
        dest = fact["destinationObject"]
        result.update({
            "destinationObjectUid": dest.get("id"),
            "destinationObjectType": dest.get("type", {}).get("name") if isinstance(dest.get("type"), dict) else str(dest.get("type", "")),
            "destinationObjectValue": dest.get("value")
        })
    else: 
        #If no destination object, this is a meta fact, other format
        #We should get the fact from inReferenceTo instead, and return nothing
        factId = fact["inReferenceTo"].get("id")
        result = get_fact_by_id(factId)
    
    # Remove None values
    result = {k: v for k, v in result.items() if v is not None}
    return result

def format_metadata(metadata_list):
    """
    Format metadata from the ACT API to a more frontend-friendly format
    """
    if not metadata_list or not isinstance(metadata_list, list):
        return {}
    
    result = {}
    for meta_item in metadata_list:
        if not isinstance(meta_item, dict):
            continue
            
        # Extract type name and value
        type_name = meta_item.get("type", {}).get("name") if isinstance(meta_item.get("type"), dict) else str(meta_item.get("type", ""))
        if type_name:
            field = to_camel_case(type_name)
            result[field] = meta_item.get("value")
    
    return result

def to_camel_case(snake_str):
    """
    Convert snake_case to camelCase
    """
    words = snake_str.split('_')
    camel = words[0].lower() + ''.join(word.capitalize() for word in words[1:])
    return camel

def get_fact_by_id(fact_id):
    """
    Helper function to get a fact by its ID
    """
    result, status_code = make_act_api_request(f"/v1/fact/uuid/{fact_id}", "GET")

    if status_code != 200:
        return jsonify(result), status_code
            
    # Process and transform the results if needed
    if "data" in result:
        # Format each fact in the data array (should only be one fact)
        fact = result["data"]
        formatted_fact = format_fact(fact)

    return formatted_fact

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, debug=True)
