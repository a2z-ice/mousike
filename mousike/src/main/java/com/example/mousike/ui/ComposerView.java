package com.example.mousike.ui;

import com.example.mousike.extraction.ComposerExtractor;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.html.H2;
import com.vaadin.flow.component.html.Pre;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.component.textfield.TextArea;
import com.vaadin.flow.router.PageTitle;
import com.vaadin.flow.router.Route;

@Route(value = "composer", layout = MainLayout.class)
@PageTitle("Composer Extraction - Mousike")
public class ComposerView extends VerticalLayout {

    public ComposerView(ComposerExtractor extractor) {
        add(new H2("Composer Data Extraction"));

        var inputArea = new TextArea("Paste text about a composer");
        inputArea.setWidthFull();
        inputArea.setMinHeight("150px");
        inputArea.setId("composer-input");

        var resultArea = new Pre();
        resultArea.setId("extraction-result");
        resultArea.getStyle().set("white-space", "pre-wrap")
                .set("background", "#f5f5f5")
                .set("padding", "10px")
                .set("border-radius", "4px");

        var extractButton = new Button("Extract");
        extractButton.setId("extract-button");
        extractButton.addClickListener(e -> {
            String result = extractor.extract(inputArea.getValue());
            resultArea.setText(result);
        });

        add(inputArea, extractButton, resultArea);
    }
}
