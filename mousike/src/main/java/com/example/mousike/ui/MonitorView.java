package com.example.mousike.ui;

import com.vaadin.flow.component.html.Anchor;
import com.vaadin.flow.component.html.H2;
import com.vaadin.flow.component.html.Paragraph;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.router.PageTitle;
import com.vaadin.flow.router.Route;

@Route(value = "monitor", layout = MainLayout.class)
@PageTitle("Monitor - Mousike")
public class MonitorView extends VerticalLayout {

    public MonitorView() {
        add(new H2("Observability Dashboards"));

        add(new Paragraph("External dashboards for monitoring the system:"));

        var phoenix = new Anchor("http://localhost:6006", "Phoenix (LLM Traces)");
        phoenix.setTarget("_blank");
        phoenix.setId("phoenix-link");

        var grafana = new Anchor("http://localhost:3000", "Grafana (Metrics/Logs/Traces)");
        grafana.setTarget("_blank");
        grafana.setId("grafana-link");

        var actuator = new Anchor("/actuator/health", "Health Check");
        actuator.setTarget("_blank");
        actuator.setId("health-link");

        add(phoenix, grafana, actuator);
    }
}
