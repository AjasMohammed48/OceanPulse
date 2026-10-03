# 🌊 OceanPulse — Physics-Constrained Ocean Intelligence

OceanPulse is a full-stack ocean intelligence platform designed to monitor, analyze, and visualize environmental conditions across the Indian Ocean using multi-source oceanographic and atmospheric data.

The platform combines ocean physics, data analytics, anomaly detection, uncertainty analysis, interactive visualization, and AI to transform complex ocean datasets into an accessible intelligence platform.

---

## 🚀 Features

### 🌡️ Ocean Monitoring

- Sea Surface Temperature (SST) monitoring
- SST anomaly analysis
- Marine Heatwave (MHW) detection
- Marine Heatwave intensity classification
- Rapid ocean-condition change detection
- Long-term ocean trend analysis
- Ocean Heat Content analysis
- Mixed Layer Depth (MLD) analysis
- Thermocline analysis
- Wind and heat-flux analysis

### 🌊 Argo Float Analysis

OceanPulse processes Argo float observations to analyze the physical state of the ocean.

- Argo profile processing
- Temperature and salinity analysis
- Mixed Layer Depth calculation
- Ocean Heat Content calculation
- Density calculations
- Thermocline analysis
- Argo profile visualization
- Spatial mapping of Argo observations
- Profile uncertainty estimation
- Argo profile upload and analysis

### 🌍 Climate Indices

OceanPulse analyzes ocean conditions alongside major climate indices:

- ENSO
- Indian Ocean Dipole (IOD)
- Pacific Decadal Oscillation (PDO)

The system classifies climate phases and uses them for contextual analysis of ocean conditions and marine heatwaves.

### 🔬 Scientific Analysis

The analysis layer includes:

- Marine Heatwave event detection and segmentation
- Seasonal climatology
- Seasonal anomaly analysis
- Indian Ocean basin-level analysis
- MHW probability indicators
- Ocean stratification trends
- Climate correlation analysis
- Rapid ocean-condition change detection
- Long-term trend analysis

### 📊 Uncertainty Analysis

OceanPulse includes an uncertainty and confidence layer based on factors such as:

- Data sparsity
- Instrument uncertainty
- Physics consistency
- Climatological bounds

This allows calculated ocean variables to be associated with confidence information.

---

# 🤖 OceanPulse AI Assistant

OceanPulse includes an AI-powered ocean assistant using **Ollama** and a locally hosted language model.

The AI assistant is connected to processed OceanPulse datasets and can answer questions about available ocean conditions.

It can provide information about:

- Marine Heatwave conditions
- SST anomalies
- Climate indices
- Ocean trends
- Argo observations
- Ocean statistics
- Uploaded CSV datasets

The current backend configuration uses:

```text
llama3.2:latest
