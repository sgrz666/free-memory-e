import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { TrialResult } from '../constants';

interface MemoryNetworkProps {
  result: TrialResult;
  width?: number;
  height?: number;
}

interface Node extends d3.SimulationNodeDatum {
  id: string;
  word: string;
  category?: string;
  isRecalled: boolean;
  originalIndex: number;
  isFalseMemory?: boolean;
  isCriticalLure?: boolean;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string;
  target: string;
  type: 'temporal' | 'semantic' | 'recall';
  value: number;
}

export const MemoryNetwork: React.FC<MemoryNetworkProps> = ({ result, width = 600, height = 400 }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    // Clear previous SVG content
    d3.select(svgRef.current).selectAll("*").remove();

    const nodes: Node[] = result.presentedWords.map((word, i) => ({
      id: `word-${i}`,
      word,
      category: result.wordCategories ? result.wordCategories[i] : undefined,
      isRecalled: result.recallSuccess[i],
      originalIndex: i
    }));

    // Add false memories as nodes
    if (result.falseMemories) {
      result.falseMemories.forEach((word, i) => {
        const isLure = result.criticalLures?.some(lure => lure.toLowerCase() === word.toLowerCase());
        nodes.push({
          id: `false-${i}`,
          word,
          isRecalled: true,
          originalIndex: -1,
          isFalseMemory: true,
          isCriticalLure: isLure
        });
      });
    }

    const links: Link[] = [];

    // 1. Semantic Links (within same category)
    if (result.wordCategories) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          if (nodes[i].category === nodes[j].category && nodes[i].category !== undefined) {
            links.push({
              source: nodes[i].id,
              target: nodes[j].id,
              type: 'semantic',
              value: 1
            });
          }
        }
      }
    }

    // 2. Recall Sequence Links
    if (result.recallOrder && result.recallOrder.length > 1) {
      for (let i = 0; i < result.recallOrder.length - 1; i++) {
        links.push({
          source: `word-${result.recallOrder[i]}`,
          target: `word-${result.recallOrder[i+1]}`,
          type: 'recall',
          value: 2
        });
      }
    }

    // 3. False Memory Recall Links
    // This is a bit complex because recallOrder only tracks presented words.
    // Let's link false memories to the closest semantic neighbor if possible, or just let them float.
    // Alternatively, we can just link them if they were recalled in sequence.
    if (result.falseMemories && result.recalledWords) {
      for (let i = 0; i < result.recalledWords.length - 1; i++) {
        const current = result.recalledWords[i].toLowerCase();
        const next = result.recalledWords[i+1].toLowerCase();
        
        const sourceNode = nodes.find(n => n.word.toLowerCase() === current);
        const targetNode = nodes.find(n => n.word.toLowerCase() === next);
        
        if (sourceNode && targetNode) {
          // Avoid duplicate links if already added by recallOrder
          const exists = links.some(l => 
            l.type === 'recall' && 
            ((l.source === sourceNode.id && l.target === targetNode.id) || 
             (typeof l.source === 'object' && (l.source as any).id === sourceNode.id && (l.target as any).id === targetNode.id))
          );
          
          if (!exists) {
            links.push({
              source: sourceNode.id,
              target: targetNode.id,
              type: 'recall',
              value: 2
            });
          }
        }
      }
    }

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height])
      .attr("style", "max-width: 100%; height: auto;");

    // Tooltip setup
    const tooltip = d3.select("body").append("div")
      .attr("class", "d3-tooltip")
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background-color", "rgba(24, 24, 27, 0.95)")
      .style("color", "white")
      .style("padding", "8px 12px")
      .style("border-radius", "6px")
      .style("font-size", "11px")
      .style("font-family", "monospace")
      .style("pointer-events", "none")
      .style("z-index", "100")
      .style("box-shadow", "0 4px 6px -1px rgb(0 0 0 / 0.1)");

    const simulation = d3.forceSimulation<Node>(nodes)
      .force("link", d3.forceLink<Node, Link>(links).id(d => d.id).distance(80))
      .force("charge", d3.forceManyBody().strength(-150))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(0.1))
      .force("y", d3.forceY(height / 2).strength(0.1));

    // Draw links
    const link = svg.append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", d => d.type === 'recall' ? "#18181b" : "#e4e4e7")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", d => d.type === 'recall' ? 2 : 1)
      .attr("stroke-dasharray", d => d.type === 'semantic' ? "4,4" : "0")
      .style("transition", "stroke-opacity 0.2s, stroke 0.2s");

    // Draw nodes
    const node = svg.append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "grab")
      .call(d3.drag<SVGGElement, Node>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended) as any);

    node.append("circle")
      .attr("r", d => d.isCriticalLure ? 12 : (d.isRecalled ? 8 : 5))
      .attr("fill", d => {
        if (d.isCriticalLure) return "#f59e0b"; // Amber for lures
        if (d.isFalseMemory) return "#fcd34d"; // Lighter amber for other false memories
        return d.isRecalled ? "#10b981" : "#f4f4f5";
      })
      .attr("stroke", d => d.isCriticalLure ? "#b45309" : "#18181b")
      .attr("stroke-width", d => d.isCriticalLure ? 3 : 1.5)
      .attr("stroke-dasharray", d => d.isFalseMemory ? "2,2" : "0")
      .style("transition", "r 0.2s, fill 0.2s, stroke-width 0.2s");

    node.append("text")
      .attr("x", d => d.isCriticalLure ? 16 : 12)
      .attr("y", 4)
      .text(d => d.word + (d.isCriticalLure ? " 🎯" : ""))
      .attr("font-size", d => d.isCriticalLure ? "12px" : "10px")
      .attr("font-weight", d => d.isCriticalLure ? "bold" : "normal")
      .attr("font-family", "monospace")
      .attr("fill", d => {
        if (d.isCriticalLure) return "#b45309";
        return d.isRecalled ? "#18181b" : "#a1a1aa";
      })
      .style("pointer-events", "none")
      .style("transition", "font-size 0.2s, fill 0.2s");

    // Interaction
    node.on("mouseover", function(event, d) {
      d3.select(this).select("circle").attr("r", d.isCriticalLure ? 15 : (d.isRecalled ? 11 : 8));
      d3.select(this).select("text").attr("font-size", "14px").attr("fill", "#000");
      
      // Highlight connected links
      link.transition().duration(200)
        .attr("stroke-opacity", l => {
          const sourceId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
          const targetId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
          return (sourceId === d.id || targetId === d.id) ? 1 : 0.1;
        })
        .attr("stroke", l => {
          const sourceId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
          const targetId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
          return (sourceId === d.id || targetId === d.id) ? "#10b981" : "#e4e4e7";
        });

      // Tooltip
      let content = `<div style="font-weight:bold; margin-bottom:4px;">${d.word}</div>`;
      if (d.category) content += `<div style="color:#a1a1aa;">范畴: ${d.category}</div>`;
      if (d.isCriticalLure) content += `<div style="color:#f59e0b; margin-top:4px;">⚠️ 核心诱饵 (虚假记忆)</div>`;
      else if (d.isFalseMemory) content += `<div style="color:#fcd34d; margin-top:4px;">❌ 错误记忆</div>`;
      else content += `<div style="color:${d.isRecalled ? '#10b981' : '#f87171'}; margin-top:4px;">${d.isRecalled ? '✓ 已回忆' : '✗ 未回忆'}</div>`;
      if (d.originalIndex !== -1) content += `<div style="color:#71717a; font-size:9px; margin-top:4px;">原始位置: ${d.originalIndex + 1}</div>`;

      tooltip.html(content)
        .style("visibility", "visible")
        .style("top", (event.pageY - 10) + "px")
        .style("left", (event.pageX + 10) + "px");
    })
    .on("mousemove", function(event) {
      tooltip.style("top", (event.pageY - 10) + "px")
        .style("left", (event.pageX + 10) + "px");
    })
    .on("mouseout", function(event, d) {
      d3.select(this).select("circle").attr("r", d.isCriticalLure ? 12 : (d.isRecalled ? 8 : 5));
      d3.select(this).select("text").attr("font-size", d.isCriticalLure ? "12px" : "10px").attr("fill", d => {
        const nodeData = d as Node;
        if (nodeData.isCriticalLure) return "#b45309";
        return nodeData.isRecalled ? "#18181b" : "#a1a1aa";
      });
      
      link.transition().duration(200)
        .attr("stroke-opacity", 0.6)
        .attr("stroke", d => d.type === 'recall' ? "#18181b" : "#e4e4e7");

      tooltip.style("visibility", "hidden");
    });

    simulation.on("tick", () => {
      link
        .attr("x1", d => (d.source as any).x)
        .attr("y1", d => (d.source as any).y)
        .attr("x2", d => (d.target as any).x)
        .attr("y2", d => (d.target as any).y);

      node
        .attr("transform", d => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return () => {
      simulation.stop();
      tooltip.remove();
    };
  }, [result, width, height]);

  return (
    <div className="w-full bg-white rounded-xl border border-zinc-100 overflow-hidden shadow-inner">
      <svg ref={svgRef}></svg>
      <div className="p-3 bg-zinc-50 border-t border-zinc-100 flex flex-wrap gap-4 justify-center">
        <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-tighter">
          <div className="w-2 h-2 bg-[#10b981] rounded-full"></div>
          <span>已回忆</span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-tighter">
          <div className="w-2 h-2 bg-[#f59e0b] border-2 border-[#b45309] rounded-full"></div>
          <span>核心诱饵</span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-tighter">
          <div className="w-2 h-2 bg-[#fcd34d] border border-zinc-900 border-dashed rounded-full"></div>
          <span>错误记忆</span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-tighter">
          <div className="w-2 h-2 bg-[#f4f4f5] border border-zinc-900 rounded-full"></div>
          <span>未回忆</span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-tighter">
          <div className="w-4 h-[1px] bg-zinc-900"></div>
          <span>回忆路径</span>
        </div>
      </div>
    </div>
  );
};
