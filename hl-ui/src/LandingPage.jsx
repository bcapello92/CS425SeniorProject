import "./LandingPage.css";

export default function LandingPage() {
  return (
    <div className="landingPage">
      <section className="landingHero">
        <div className="landingBadge">University of Nevada, Reno CSE</div>
        <h1 className="landingTitle">AI-Powered ENT Patient Support Chatbot</h1>
        <p className="landingSubtitle">
          Department: Computer Science and Engineering, University of Nevada,
          Reno
        </p>

        <div className="landingMetaGrid" role="list">
          <div className="landingMetaCard" role="listitem">
            <div className="landingMetaLabel">Project Title</div>
            <div className="landingMetaValue">
              AI-Powered ENT Patient Support Chatbot
            </div>
          </div>

          <div className="landingMetaCard" role="listitem">
            <div className="landingMetaLabel">Team</div>
            <div className="landingMetaValue">20</div>
          </div>

          <div className="landingMetaCard" role="listitem">
            <div className="landingMetaLabel">Team Members</div>
            <div className="landingMetaValue">
              Wiem Boubaker, Divisha Naharas, Brendan Capello
            </div>
          </div>

          <div className="landingMetaCard" role="listitem">
            <div className="landingMetaLabel">Instructor</div>
            <div className="landingMetaValue">David Feil-Seifer</div>
          </div>

          <div className="landingMetaCard" role="listitem">
            <div className="landingMetaLabel">External Advisor</div>
            <div className="landingMetaValue">
              James McDuffie and Dr. Benjamin Teitelbaum
            </div>
          </div>
        </div>
      </section>

      <main className="landingContent">
        <h2 className="landingSectionTitle">Project Description</h2>

        <div className="landingCard">
          <p className="landingParagraph">
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

          <p className="landingParagraph">
            Its primary capacity is an interactive chatbot that performs
            natural language chats with patients to gather symptom information
            such as onset, duration, severity. The system uses the unstructured
            chat data to perform automated clinical triage, categorizing patient
            condition into one of three levels: routine (green), moderate
            (orange), and emergency (red). For healthcare providers, the system
            provides a secure, real-time Provider Triage Dashboard that shows
            AI-generated rationales for each categorization and allows doctors
            to examine chat transcripts and overrule automatic triage results as
            needed. The system is based on a contemporary web architecture that
            runs on Amazon Web Services (AWS). The frontend is built using
            React.js and Vite for high speed and a more responsive, accessible
            user experience. It talks with a Node.js/Express middleware proxy,
            which handles request signing securely. The backend processing is
            based on a microservices architecture, with Python (FastAPI)
            serving the custom-trained Triage ML model and Ollama running local
            Llama-3.2 instances to support the conversational features. AWS
            HealthLake manages data persistence, which provides industry-standard
            FHIR-compliant storage for patient information, while Amazon Cognito
            handles powerful user authentication and access management to ensure
            providers have safe access.
          </p>

          <p className="landingParagraph">
            Safety is the most important consideration in a medical triage
            application. To reduce clinical risk, the natural language
            processing component is bound by a strict system prompt that
            prohibits the AI from producing diagnoses, treatment plans, or
            medical advice. Furthermore, the product is developed as a clinical
            decision support system rather than an autonomous agent; all triage
            classifications are offered as suggestions to a human physician,
            who maintains the final authority and responsibility for patient
            care. Security is another crucial aspect that appears especially
            when dealing with Protected Health Information (PHI). We accomplish
            strong security mostly with AWS Cognito, which handles identity and
            access management. This guarantees that critical provider
            dashboards may only be accessed by authenticated and authorized
            workers. Reliability is achieved through the use of AWS HealthLake
            as the backend data store, taking advantage of the inherent high
            availability and durability of AWS cloud infrastructure, reducing
            the chance of database downtime compared to a self-hosted solution.
            However the fine-tuned LLM model responsible for the classification
            cant achieve 100% accuracy and thats why we allowed the doctors to
            override the triage results when needed.
          </p>
        </div>

        <h2 className="landingSectionTitle">Project Domain and References</h2>

        <div className="landingCard">
          <h3 className="landingRefHeading">Problem Domain Book</h3>
          <p className="landingReference">
            Francis, H. W., Haughey, B. H., Lesperance, M. M., Lund, V. J.,
            Robbins, K. T., Park, S. S., &amp; Hillel, A. (eds.). (2025). <em>
            Cummings Otolaryngology: Head and Neck Surgery </em>(8th ed.).
            Philadelphia, PA: Elsevier.
          </p>

          <h3 className="landingRefHeading">Reference Articles</h3>
          <p className="landingReference">
            Semigran, H. L., Linder, J. A., Gidengil, C., &amp; Mehrotra, A.
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

          <p className="landingReference">
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

          <h3 className="landingRefHeading">Websites</h3>
          <p className="landingReference">
            HL7. (2025). FHIR Overview (R5). <em>HL7 FHIR Specification</em>.{" "}
            <a
              href="https://hl7.org/fhir/overview.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              https://hl7.org/fhir/overview.html
            </a>
          </p>
        </div>

        <footer className="landingFooter">
          <span>ENT Triage Project Landing Page</span>
        </footer>
      </main>
    </div>
  );
}
