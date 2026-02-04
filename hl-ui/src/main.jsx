// hl-ui/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider} from "./useAuth.jsx"
import{ BrowserRouter} from "react-router-dom"
const root = ReactDOM.createRoot(
	document.getElementById("root")
);

root.render(
	<React.StrictMode>
	   <AuthProvider>
		<BrowserRouter>
	      <App />
		</BrowserRouter>
	   </AuthProvider>
	</React.StrictMode>
);