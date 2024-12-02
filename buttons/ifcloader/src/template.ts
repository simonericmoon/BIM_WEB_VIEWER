import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";

export interface LoadIfcUIState {
  components: OBC.Components;
}

export const loadIfcTemplate = (state: LoadIfcUIState) => {
  const { components } = state;
  const ifcLoader = components.get(OBC.IfcLoader);

  const uploadToServer = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload-default-ifc/', {
        method: 'POST',
        body: formData,
        headers: {
          // Don't set Content-Type header - it will be automatically set with boundary
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to upload to server');
      }

      const result = await response.json();
      console.log('Server upload successful:', result.message);
    } catch (error) {
      console.error('Failed to upload to server:', error);
      // You might want to show this error to the user
      alert(`Failed to upload to server: ${error.message}`);
    }
  };

  const onBtnClick = () => {
    const fileOpener = document.createElement("input");
    fileOpener.type = "file";
    fileOpener.accept = ".ifc";
    fileOpener.onchange = async () => {
      if (fileOpener.files === null || fileOpener.files.length === 0) return;
      
      const file = fileOpener.files[0];
      const fileName = file.name.replace(".ifc", "");
      fileOpener.remove();

      try {
        // First, load the file in the viewer
        const buffer = await file.arrayBuffer();
        const data = new Uint8Array(buffer);
        await ifcLoader.load(data, true, fileName);

        // Then, upload to server
        await uploadToServer(file);
        
        console.log('File loaded and uploaded successfully');
      } catch (error) {
        console.error('Error processing file:', error);
        alert(`Error processing file: ${error.message}`);
      }
    };
    fileOpener.click();
  };

  return BUI.html`
    <bim-button
      data-ui-id="import-ifc"
      label="Load IFC"
      icon="mage:box-3d-fill"
      @click=${onBtnClick}
    ></bim-button>
  `;
};