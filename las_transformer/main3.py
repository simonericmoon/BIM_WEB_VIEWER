import laspy
import numpy as np

def convert_las_to_v13(input_path: str, output_path: str):
    """
    Convert a LAS file to version 1.3
    
    Args:
        input_path: Path to input LAS file
        output_path: Path where to save the converted file
    """
    try:
        # Read the source file
        print(f"Reading file: {input_path}")
        input_las = laspy.read(input_path)
        
        print(f"Original LAS version: {input_las.header.version}")
        print(f"Number of points: {len(input_las.points)}")
        
        # Create a new header for LAS 1.3
        header = laspy.LasHeader(version="1.3", point_format=3)
        
        # Copy the scale and offset from the input file
        header.scales = input_las.header.scales
        header.offsets = input_las.header.offsets
        
        # Create new LAS file with converted header
        output_las = laspy.LasData(header)
        
        # Copy points
        output_las.x = input_las.x
        output_las.y = input_las.y
        output_las.z = input_las.z
        
        # Copy additional attributes if they exist
        if hasattr(input_las, 'intensity'):
            output_las.intensity = input_las.intensity
        if hasattr(input_las, 'classification'):
            output_las.classification = input_las.classification
        if hasattr(input_las, 'return_number'):
            output_las.return_number = input_las.return_number
        if hasattr(input_las, 'number_of_returns'):
            output_las.number_of_returns = input_las.number_of_returns
        if hasattr(input_las, 'scan_direction_flag'):
            output_las.scan_direction_flag = input_las.scan_direction_flag
        if hasattr(input_las, 'edge_of_flight_line'):
            output_las.edge_of_flight_line = input_las.edge_of_flight_line
        if hasattr(input_las, 'scan_angle_rank'):
            output_las.scan_angle_rank = input_las.scan_angle_rank
        if hasattr(input_las, 'user_data'):
            output_las.user_data = input_las.user_data
        if hasattr(input_las, 'point_source_id'):
            output_las.point_source_id = input_las.point_source_id
        if hasattr(input_las, 'gps_time'):
            output_las.gps_time = input_las.gps_time
        
        # Write the converted file
        print(f"Writing converted file to: {output_path}")
        output_las.write(output_path)
        
        print("Conversion completed successfully!")
        print(f"New LAS version: 1.3")
        
    except Exception as e:
        print(f"Error converting file: {str(e)}")

if __name__ == "__main__":
    # Example usage
    input_file = "output.las"  # Replace with your input file path
    output_file = "output_v1.3.las"  # Replace with desired output path
    
    convert_las_to_v13(input_file, output_file)