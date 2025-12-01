import ProviderTriage from "./ProviderTriage";
import RequireStaff from "./requireStaff";

<Route
  path="provider"
  element={
    <RequireStaff>
      <div style={{ width: '100%', maxWidth: 1200 }}>
        <ProviderTriage />
      </div>
    </RequireStaff>
  }
/>
