import pye57
import laspy
import numpy as np

def convert_e57_to_las(e57_path, las_output_path):
    """
    Convert an E57 file to LAS format
    
    Parameters:
    e57_path (str): Path to input E57 file
    las_output_path (str): Path for output LAS file
    """
    try:
        # Read the E57 file
        e57_data = pye57.E57(e57_path)
        
        # Get the scan data from the first scan in the file, ignoring missing fields
        scan_data = e57_data.read_scan(0, ignore_missing_fields=True)
        
        # Extract point cloud data
        x = scan_data['cartesianX']
        y = scan_data['cartesianY']
        z = scan_data['cartesianZ']
        
        # Create a new LAS file
        header = laspy.LasHeader(point_format=7, version="1.4")
        las = laspy.LasData(header)
        
        # Set coordinate data
        las.x = x
        las.y = y
        las.z = z
        
        # If intensity values are available in the E57 file
        if 'intensity' in scan_data:
            las.intensity = scan_data['intensity']
        
        # If RGB values are available
        if all(key in scan_data for key in ['colorRed', 'colorGreen', 'colorBlue']):
            las.red = scan_data['colorRed']
            las.green = scan_data['colorGreen']
            las.blue = scan_data['colorBlue']
        
        # Write the LAS file
        las.write(las_output_path)
        print(f"Successfully converted {e57_path} to {las_output_path}")
        
    except Exception as e:
        print(f"Error during conversion: {str(e)}")
        raise

# Example usage
if __name__ == "__main__":
    convert_e57_to_las("DDP11_Franz-List-Str.e57", "output.las")