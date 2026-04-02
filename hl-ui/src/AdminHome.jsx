import { useEffect, useState } from "react";

import { useNavigate } from "react-router-dom";
import { API_BASE } from "./config";

async function api(path) {

    const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

    return data;

}



export default function AdminHome() {

    const nav = useNavigate();

    const [me, setMe] = useState(null);

    const [err, setErr] = useState("");



    useEffect(() => {

        (async () => {

            try {

                const meData = await api("/api/me");

                setMe(meData);

                const isAdmin = (meData.roles || []).includes("admin");

                if (!isAdmin) setErr("403: Admins only.");

            } catch (e) {

                setErr(e?.message || String(e));

            }

        })();

    }, []);



    return (

        <div style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>

            <h2 style={{ marginTop: 0 }}>Admin Dashboard</h2>



            {err ? (

                <div style={{ padding: 12, border: "1px solid #fecaca", background: "#fff1f2", borderRadius: 8 }}>

                    {err}

                </div>

            ) : null}



            {me ? (

                <div style={{ marginBottom: 14, fontSize: 13, opacity: 0.85 }}>

                    Signed in as <b>{me.email || "(none)"}</b> � roles: <b>{(me.roles || []).join(", ")}</b>

                </div>

            ) : null}



            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>

                <button style={card} onClick={() => nav("/provider/admin/accounts")}>

                    <div style={title}>Account Approvals</div>

                    <div style={desc}>Approve pending users and assign roles.</div>

                </button>



                <button style={card} onClick={() => nav("/provider/admin/audit")}>

                    <div style={title}>Audit Log</div>

                    <div style={desc}>View recent admin/system actions.</div>

                </button>

            </div>

        </div>

    );

}



const card = {

    textAlign: "left",

    padding: 14,

    borderRadius: 14,

    border: "1px solid #e7edf5",

    background: "#fff",

    cursor: "pointer",

};

const title = { fontWeight: 900, fontSize: 15, marginBottom: 6 };

const desc = { fontSize: 13, opacity: 0.8 };