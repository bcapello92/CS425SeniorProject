import { useNavigate } from "react-router-dom";

export default function ProviderHome(){
const navigate = useNavigate();

return(
	 <div style={page}>
      <h1>Provider Dashboard</h1>
      <p>Welcome. Choose an action below.</p>

      <div style={grid}>
        <DashboardCard
          title="Triage Board"
          desc="View and manage active patient triage cases"
          onClick={() => navigate("/provider/triage")}
        />
        <DashboardCard
          title="Scheduling"
          desc="View and manage patient appointments"
          onClick={() => navigate("/provider/schedule")}
        />
        <DashboardCard
          title="File Upload"
          desc="Upload de-identified patient data for training"
          onClick={() => navigate("/provider/upload")}
        />
        <DashboardCard
          title="Account Management"
          desc="Manage your provider account"
          onClick={() => navigate("/provider/account")}
        />
      </div>
    </div>

);

}

function DashboardCard({title, desc, onClick}){
return(
    <div onClick={onClick} style={card}>
       <h3>{title}</h3>
       <p>{desc}</p>
    </div>
);

}

const page = { 
    minHeight: "100vh",
    padding: 32,
    background: "#f5f7fb"

};

const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap:16,
    marginTop:24
};

const card = {
    padding: 20,
    borderRadius: 12,
    background: "#fff",
    border: "1px solid #eee",
    cursor: "pointer",
    boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
    transition: "transform .1s ease",
};



