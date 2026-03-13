package com.example.mousike.config;

import com.example.mousike.tools.MusicKnowledgeTools;
import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.ai.tool.method.MethodToolCallbackProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class McpServerConfig {

    @Bean
    public ToolCallbackProvider musicKnowledgeToolProvider(MusicKnowledgeTools musicKnowledgeTools) {
        return MethodToolCallbackProvider.builder()
                .toolObjects(musicKnowledgeTools)
                .build();
    }
}
