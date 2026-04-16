import asyncio
import httpx
import uuid
import datetime
import random

async def send_data():
    base_url = "http://localhost:8001/api"
    
    async with httpx.AsyncClient() as client:
        try:
            print("Fetching cameras and zones...")
            cameras_res = await client.get(f"{base_url}/cameras")
            zones_res = await client.get(f"{base_url}/zones")
            
            cameras = cameras_res.json()
            zones = zones_res.json()
            
            if not cameras:
                print("No cameras found in DB.")
                return
                
            camera = cameras[1] if len(cameras) > 1 else cameras[0]
            camera_id = camera["id"]

            if not zones:
                print("No zones found in DB. Creating a dummy zone...")
                payload = {
                    "name": "Entrance Zone",
                    "description": "Auto-generated test zone",
                    "coordinates": [[0,0], [100,0], [100,100], [0,100]],
                    "zone_type": "entrance"
                }
                new_zone_res = await client.post(f"{base_url}/zones", json=payload)
                if new_zone_res.status_code != 200:
                    print(f"Failed to create zone: {new_zone_res.status_code} {new_zone_res.text}")
                    return
                zone_data = new_zone_res.json()
                zone_id = zone_data["id"]
                
                # Assign this zone to the camera so it shows up correctly in relations if needed
                print(f"Assigning zone {zone_id} to camera {camera_id}")
                await client.put(f"{base_url}/cameras/{camera_id}", json={"zone_id": zone_id})
            else:
                zone_id = zones[0]["id"]
            
            print(f"Using Camera {camera_id} and Zone {zone_id}")
            
            # Send batch of events
            for i in range(10):
                event_type = "person_enter" if i % 2 == 0 else "person_exit"
                event_payload = {
                    "camera_id": camera_id,
                    "zone_id": zone_id,
                    "track_id": 1000 + i,
                    "event_type": event_type,
                    "object_class": "person",
                    "confidence": 0.85 + (random.random() * 0.1),
                    "bbox": [100, 100, 200, 400]
                }
                
                print(f"Sending Event {i+1}...")
                r = await client.post(f"{base_url}/events", json=event_payload)
                if r.status_code != 200:
                    print(f"Event failed: {r.status_code} {r.text}")
                
                # Send a detection too to populate the "Live Feed" if it's polling
                detection_payload = {
                    "camera_id": camera_id,
                    "detections": [{
                        "track_id": 1000 + i,
                        "class_name": "person",
                        "confidence": 0.9,
                        "bbox": [100, 100, 200, 400],
                        "frame_width": 1280,
                        "frame_height": 720
                    }],
                    "total_persons": 1,
                    "total_objects": 1,
                    "worker_status": "active"
                }
                await client.post(f"{base_url}/detection", json=detection_payload)
                
                await asyncio.sleep(0.5)
            
            print("Successfully sent dummy data.")
            
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(send_data())
