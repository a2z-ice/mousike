package com.example.mousike.ui;

import com.example.mousike.semantic.SemanticSearchService;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.grid.Grid;
import com.vaadin.flow.component.html.H2;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.component.select.Select;
import com.vaadin.flow.component.textfield.TextField;
import com.vaadin.flow.router.PageTitle;
import com.vaadin.flow.router.Route;

import java.util.Map;

@Route(value = "search", layout = MainLayout.class)
@PageTitle("Search - Mousike")
public class SearchView extends VerticalLayout {

    public SearchView(SemanticSearchService searchService) {
        add(new H2("Semantic Search"));

        var queryField = new TextField("Query");
        queryField.setWidthFull();
        queryField.setId("search-input");

        var categorySelect = new Select<String>();
        categorySelect.setItems("", "composers", "instruments", "theory", "history", "genres");
        categorySelect.setLabel("Category");
        categorySelect.setId("category-select");

        var grid = new Grid<Map<String, Object>>();
        grid.addColumn(item -> truncate(String.valueOf(item.get("content")), 200)).setHeader("Content").setFlexGrow(3);
        grid.addColumn(item -> String.valueOf(item.get("metadata"))).setHeader("Metadata").setFlexGrow(1);
        grid.setWidthFull();
        grid.setId("search-results");

        var searchButton = new Button("Search");
        searchButton.setId("search-button");
        searchButton.addClickListener(e -> {
            var results = searchService.search(
                    queryField.getValue(),
                    categorySelect.getValue(),
                    5
            );
            grid.setItems(results);
        });

        add(new HorizontalLayout(queryField, categorySelect, searchButton), grid);
    }

    private String truncate(String text, int maxLen) {
        return text.length() > maxLen ? text.substring(0, maxLen) + "..." : text;
    }
}
