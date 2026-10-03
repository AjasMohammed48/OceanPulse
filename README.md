🌊 OceanPulse — Physics-Constrained Ocean Intelligence

OceanPulse is a full-stack ocean intelligence platform designed to monitor, analyze, and visualize environmental conditions across the Indian Ocean using multi-source oceanographic and atmospheric data.

The project combines ocean physics, data analytics, anomaly detection, uncertainty analysis, interactive visualization, and AI to transform large-scale scientific datasets into an accessible intelligence platform.

🚀 Key Features
🌡️ Ocean Monitoring
Sea Surface Temperature (SST) monitoring
SST anomaly analysis
Marine Heatwave (MHW) detection
Marine Heatwave intensity classification
Rapid ocean-condition change detection
Long-term ocean trend analysis
Ocean Heat Content analysis
Mixed Layer Depth (MLD) analysis
Thermocline analysis
Wind and heat-flux analysis
🌊 Argo Float Analysis

OceanPulse processes Argo float observations to analyze the physical state of the ocean.

The platform supports:

Argo profile processing
Temperature and salinity analysis
Mixed Layer Depth calculation
Ocean Heat Content calculation
Density calculations
Thermocline analysis
Argo profile visualization
Spatial mapping of Argo observations
Profile uncertainty estimation
🌍 Climate Indices

Ocean conditions are analyzed alongside major climate indices:

ENSO
Indian Ocean Dipole (IOD)
Pacific Decadal Oscillation (PDO)

The system classifies the corresponding climate phases and uses them for contextual analysis of marine heatwaves and ocean trends.

🔬 Scientific Analysis

OceanPulse contains several analytical layers.

Marine Heatwave Detection

The project implements a Hobday-based Marine Heatwave detection approach using climatological thresholds and persistence criteria.

The system identifies:

MHW events
Event duration
Intensity
Coverage
Categories
Related ENSO/IOD conditions
Extended Analysis

The analysis layer includes:

MHW event segmentation
Seasonal climatology
Seasonal anomalies
Indian Ocean basin analysis
MHW probability indicators
Ocean stratification trends
Climate correlations
Uncertainty Analysis

OceanPulse also includes an uncertainty layer considering factors such as:

Data sparsity
Instrument uncertainty
Physics consistency
Climatological bounds

This allows calculated ocean variables to be associated with confidence information rather than presenting every result as equally certain.

🤖 OceanPulse AI Assistant

OceanPulse includes an AI-powered ocean assistant using Ollama and a locally hosted language model.

The assistant is connected to the processed OceanPulse datasets and can answer questions about the available ocean conditions.

It can provide context about:

Current Marine Heatwave conditions
SST anomalies
Climate indices
Ocean trends
Argo observations
Processed ocean statistics

The backend currently uses:

llama3.2:latest

The AI assistant can also process uploaded CSV files and generate chart-ready responses when appropriate.
