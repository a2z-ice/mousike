package com.example.mousike.ui;

import com.example.mousike.chat.ChatService;
import com.vaadin.flow.component.Key;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.html.H2;
import com.vaadin.flow.component.html.Paragraph;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.component.textfield.TextField;
import com.vaadin.flow.router.PageTitle;
import com.vaadin.flow.router.Route;

import java.util.UUID;

@Route(value = "chat", layout = MainLayout.class)
@PageTitle("Chat - Mousike")
public class ChatView extends VerticalLayout {

    private final ChatService chatService;
    private final String conversationId = UUID.randomUUID().toString();
    private final Div messageContainer = new Div();

    public ChatView(ChatService chatService) {
        this.chatService = chatService;

        add(new H2("Composer Assistant Chat"));

        messageContainer.setWidthFull();
        messageContainer.getStyle()
                .set("min-height", "400px")
                .set("overflow-y", "auto")
                .set("padding", "10px")
                .set("border", "1px solid #ddd")
                .set("border-radius", "4px");

        var messageInput = new TextField();
        messageInput.setPlaceholder("Ask about music, composers, instruments...");
        messageInput.setWidthFull();
        messageInput.setId("chat-input");

        var sendButton = new Button("Send");
        sendButton.setId("send-button");
        sendButton.addClickShortcut(Key.ENTER);
        sendButton.addClickListener(e -> {
            String message = messageInput.getValue();
            if (!message.isBlank()) {
                addMessage("You", message, "user-message");
                messageInput.clear();
                StringBuilder responseBuilder = new StringBuilder();
                var responseBubble = addMessage("Mousike", "...", "assistant-message");
                chatService.chat(conversationId, message)
                        .doOnNext(token -> {
                            responseBuilder.append(token);
                            getUI().ifPresent(ui -> ui.access(() ->
                                    responseBubble.setText(responseBuilder.toString())));
                        })
                        .subscribe();
            }
        });

        var clearButton = new Button("Clear History");
        clearButton.setId("clear-button");
        clearButton.addClickListener(e -> {
            chatService.clearHistory(conversationId);
            messageContainer.removeAll();
        });

        var inputRow = new HorizontalLayout(messageInput, sendButton, clearButton);
        inputRow.setWidthFull();
        inputRow.setAlignItems(Alignment.END);

        add(messageContainer, inputRow);
        setWidthFull();
    }

    private Paragraph addMessage(String sender, String text, String cssClass) {
        var msg = new Paragraph(sender + ": " + text);
        msg.addClassName(cssClass);
        messageContainer.add(msg);
        return msg;
    }
}
