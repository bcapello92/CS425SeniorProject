import "./App.css";

function App() {
  return (
    <div className="page">
      <header className="topbar">
        <a className="navLink navLinkLeft" href="/provider">
          Provider Portal
        </a>
        <a className="navLink navLinkRight" href="/">
          Patient Page
        </a>
      </header>

      <section className="hero">
        <div className="badge">University of Nevada, Reno CSE</div>
        <h1 className="title">AI-Powered ENT Patient Support Chatbot</h1>
        <p className="subtitle">
          Department of Computer Science and Engineering, University of Nevada,
          Reno
        </p>

        <div className="metaGrid" role="list">
          <div className="metaCard" role="listitem">
            <div className="metaLabel">Project Title</div>
            <div className="metaValue">AI-Powered ENT Patient Support Chatbot</div>
          </div>

          <div className="metaCard" role="listitem">
            <div className="metaLabel">Team</div>
            <div className="metaValue">20</div>
          </div>

          <div className="metaCard" role="listitem">
            <div className="metaLabel">Team Members</div>
            <div className="metaValue">
              Wiem Boubaker, Divisha Naharas, Brendan Capello
            </div>
          </div>

          <div className="metaCard" role="listitem">
            <div className="metaLabel">Instructor</div>
            <div className="metaValue">David Feil-Seifer</div>
          </div>

          <div className="metaCard" role="listitem">
            <div className="metaLabel">External Advisor</div>
            <div className="metaValue">
              James McDuffie and Dr. Benjamin Teitelbaum
            </div>
          </div>
        </div>
      </section>

      <main className="content">
        <section className="card">
          <div className="sectionHeader">
            <h2 className="sectionTitle">Project Description</h2>
            <p className="sectionIntro">
              A triage-first patient support platform for ENT symptom intake,
              clinician review, and safer routing to care.
            </p>
          </div>

          <p className="paragraph">
            The purpose of this project is to create and deploy an ENT Patient
            Support Chatbot System to help users assess the urgency of ear,
            nose, and throat symptoms before seeking professional medical
            assistance. The system&apos;s primary users are individuals with ENT
            symptoms who are unsure about the seriousness of their condition. By
            providing early information, the system can minimize unnecessary
            emergency visits while promoting prompt care for critical
            situations. A second category of users are healthcare
            professionals, such as physicians and nurses, who benefit from a
            linked dashboard that allows them to examine triage findings,
            monitor notifications, and obtain summary patient data. From a
            public interest standpoint, the system supports increased
            healthcare accessibility, patient knowledge, and more efficient use
            of medical resources.
          </p>

          <p className="paragraph">
            Its primary capacity is an interactive chatbot that performs
            natural language chats with patients to gather symptom information
            such as onset, duration, and severity. The system uses the
            unstructured chat data to perform automated clinical triage,
            categorizing patient condition into one of three levels: routine,
            moderate, and emergency. For healthcare providers, the system
            provides a secure, real-time Provider Triage Dashboard that shows
            AI-generated rationales for each categorization and allows doctors
            to examine chat transcripts and overrule automatic triage results
            as needed. The system is based on a contemporary web architecture
            that runs on Amazon Web Services. The frontend is built using
            React.js and Vite for a responsive, accessible user experience. It
            talks with a Node.js and Express middleware proxy, which handles
            request signing securely. The backend processing uses a
            microservices architecture, with Python and FastAPI serving the
            custom-trained triage model and Ollama running local Llama 3.2
            instances to support conversational features. AWS HealthLake
            manages data persistence with FHIR-compliant storage for patient
            information, while Amazon Cognito handles authentication and access
            management for providers.
          </p>

          <p className="paragraph">
            Safety is the most important consideration in a medical triage
            application. To reduce clinical risk, the natural language
            processing component is bound by a strict system prompt that
            prohibits the AI from producing diagnoses, treatment plans, or
            medical advice. The product is developed as a clinical decision
            support system rather than an autonomous agent, and all triage
            classifications are suggestions to a human physician who maintains
            final authority for patient care. Security is equally important
            when dealing with protected health information. We use AWS Cognito
            for identity and access management so critical provider dashboards
            remain accessible only to authenticated workers. Reliability is
            supported by AWS HealthLake as the backend data store, taking
            advantage of the high availability and durability of AWS cloud
            infrastructure. The fine-tuned model responsible for classification
            cannot achieve perfect accuracy, which is why providers can review
            and override triage results when needed.
          </p>
        </section>

        <section className="card">
          <div className="sectionHeader">
            <h2 className="sectionTitle">Project Domain and References</h2>
          </div>

          <h3 className="refHeading">Problem Domain Book</h3>
          <p className="reference">
            Francis, H. W., Haughey, B. H., Lesperance, M. M., Lund, V. J.,
            Robbins, K. T., Park, S. S., and Hillel, A. (eds.). (2025).{" "}
            <em>Cummings Otolaryngology: Head and Neck Surgery</em> (8th ed.).
            Philadelphia, PA: Elsevier.
          </p>

          <h3 className="refHeading">Reference Articles</h3>
          <p className="reference">
            Semigran, H. L., Linder, J. A., Gidengil, C., and Mehrotra, A.
            (2015). Evaluation of symptom checkers for self diagnosis and
            triage: audit study. <em>BMJ</em>, 351, h3480.{" "}
            <a
              href="https://doi.org/10.1136/bmj.h3480"
              target="_blank"
              rel="noopener noreferrer"
            >
              https://doi.org/10.1136/bmj.h3480
            </a>
          </p>

          <p className="reference">
            Ceney, A., et al. (2021). Accuracy of online symptom checkers and
            the potential impact on service utilisation. <em>PLOS ONE</em>,
            16(7), e0254088.{" "}
            <a
              href="https://doi.org/10.1371/journal.pone.0254088"
              target="_blank"
              rel="noopener noreferrer"
            >
              https://doi.org/10.1371/journal.pone.0254088
            </a>
          </p>

          <h3 className="refHeading">Websites</h3>
          <p className="reference">
            HL7. (2025). FHIR Overview (R5). <em>HL7 FHIR Specification</em>.{" "}
            <a
              href="https://hl7.org/fhir/overview.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              https://hl7.org/fhir/overview.html
            </a>
          </p>
        </section>
      </main>

      <footer className="footer">
        <span>ENT Triage Project Landing Page</span>
      </footer>
    </div>
  );
}

export default App;
