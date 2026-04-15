import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal, SankeyNode, SankeyLink } from 'd3-sankey';
import { TrialResult } from '../constants';

interface MemorySankeyProps {
  result: TrialResult;
  width?: number;
  height?: number;
}

interface NodeExtra {
  id: string;
  name: string;
  type: 'source' | 'target';
  color: string;
}

interface LinkExtra {
  word: string;
}

type Node = SankeyNode<NodeExtra, LinkExtra>;
type Link = SankeyLink<NodeExtra, LinkExtra>;

export const MemorySankey: React.FC<MemorySankeyProps> = ({ result, width = 600, height = 400 }) => {
  const svgRef = useRef<SVGGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !result.recallOrder || result.recallOrder.length === 0) return;

    // Clear previous SVG content
    d3.select(svgRef.current).selectAll("*").remove();

    const margin = { top: 20, right: 80, bottom: 20, left: 80 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

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

    // Prepare data
    const nodes: NodeExtra[] = [];
    const links: { source: string; target: string; value: number; word: string }[] = [];

    // Source nodes (Original Positions)
    result.presentedWords.forEach((word, i) => {
      nodes.push({
        id: `src-${i}`,
        name: `位置 ${i + 1}`,
        type: 'source',
        color: result.recallSuccess[i] ? "#10b981" : "#f4f4f5"
      });
    });

    // Target nodes (Recall Order)
    result.recallOrder.forEach((_, i) => {
      nodes.push({
        id: `tgt-${i}`,
        name: `第 ${i + 1} 个`,
        type: 'target',
        color: "#18181b"
      });
    });

    // Links
    result.recallOrder.forEach((originalIndex, recallIndex) => {
      links.push({
        source: `src-${originalIndex}`,
        target: `tgt-${recallIndex}`,
        value: 1,
        word: result.presentedWords[originalIndex]
      });
    });

    const sankeyGenerator = sankey<NodeExtra, LinkExtra>()
      .nodeId(d => d.id)
      .nodeWidth(15)
      .nodePadding(10)
      .extent([[0, 0], [innerWidth, innerHeight]]);

    const { nodes: sankeyNodes, links: sankeyLinks } = sankeyGenerator({
      nodes: nodes.map(d => ({ ...d })),
      links: links.map(d => ({ ...d }))
    });

    const svg = d3.select(svgRef.current)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .selectAll("g.main-container")
      .data([null])
      .join("g")
      .attr("class", "main-container")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Define gradients for links
    const defs = d3.select(svgRef.current).append("defs");
    sankeyLinks.forEach((l, i) => {
      const gradientId = `gradient-${i}`;
      const gradient = defs.append("linearGradient")
        .attr("id", gradientId)
        .attr("gradientUnits", "userSpaceOnUse")
        .attr("x1", (l.source as any).x1)
        .attr("x2", (l.target as any).x0);
      
      gradient.append("stop").attr("offset", "0%").attr("stop-color", (l.source as any).color);
      gradient.append("stop").attr("offset", "100%").attr("stop-color", (l.target as any).color);
      (l as any).gradientId = gradientId;
    });

    // Draw links
    const link = svg.append("g")
      .attr("fill", "none")
      .attr("stroke-opacity", 0.3)
      .selectAll("g")
      .data(sankeyLinks)
      .join("g")
      .style("mix-blend-mode", "multiply");

    const path = link.append("path")
      .attr("d", sankeyLinkHorizontal())
      .attr("stroke", d => `url(#${(d as any).gradientId})`)
      .attr("stroke-width", d => Math.max(1, d.width || 0))
      .style("transition", "stroke-opacity 0.2s");

    // Draw nodes
    const node = svg.append("g")
      .selectAll("g")
      .data(sankeyNodes)
      .join("g");

    node.append("rect")
      .attr("x", d => d.x0 || 0)
      .attr("y", d => d.y0 || 0)
      .attr("height", d => (d.y1 || 0) - (d.y0 || 0))
      .attr("width", d => (d.x1 || 0) - (d.x0 || 0))
      .attr("fill", d => (d as any).color)
      .attr("stroke", "#18181b")
      .attr("stroke-width", 0.5);

    node.append("text")
      .attr("x", d => (d.x0 || 0) < innerWidth / 2 ? (d.x1 || 0) + 6 : (d.x0 || 0) - 6)
      .attr("y", d => ((d.y1 || 0) + (d.y0 || 0)) / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", d => (d.x0 || 0) < innerWidth / 2 ? "start" : "end")
      .text(d => (d as any).name)
      .attr("font-size", "9px")
      .attr("font-family", "monospace")
      .attr("fill", "#71717a");

    // Interaction
    node.on("mouseover", function(event, d) {
      const relatedLinks = sankeyLinks.filter(l => l.source === d || l.target === d);
      path.transition().duration(200)
        .attr("stroke-opacity", l => relatedLinks.includes(l) ? 0.8 : 0.05);
      
      d3.select(this).select("rect").attr("stroke-width", 2);

      // Tooltip
      let content = `<div style="font-weight:bold; margin-bottom:4px;">${(d as any).name}</div>`;
      if ((d as any).type === 'source') {
        const word = result.presentedWords[(d as any).index];
        content += `<div style="color:#a1a1aa;">单词: ${word}</div>`;
        content += `<div style="color:${result.recallSuccess[(d as any).index] ? '#10b981' : '#f87171'}; margin-top:4px;">${result.recallSuccess[(d as any).index] ? '✓ 已回忆' : '✗ 未回忆'}</div>`;
      } else {
        const originalIdx = result.recallOrder![(d as any).index - result.presentedWords.length];
        const word = result.presentedWords[originalIdx];
        content += `<div style="color:#a1a1aa;">回忆单词: ${word}</div>`;
        content += `<div style="color:#71717a; font-size:9px; margin-top:4px;">原始位置: ${originalIdx + 1}</div>`;
      }

      tooltip.html(content)
        .style("visibility", "visible")
        .style("top", (event.pageY - 10) + "px")
        .style("left", (event.pageX + 10) + "px");
    })
    .on("mousemove", function(event) {
      tooltip.style("top", (event.pageY - 10) + "px")
        .style("left", (event.pageX + 10) + "px");
    })
    .on("mouseout", function() {
      path.transition().duration(200)
        .attr("stroke-opacity", 0.3);
      
      d3.select(this).select("rect").attr("stroke-width", 0.5);
      tooltip.style("visibility", "hidden");
    });

    return () => {
      tooltip.remove();
    };
  }, [result, width, height]);

  if (!result.recallOrder || result.recallOrder.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-zinc-400 text-xs font-mono italic">
        暂无回忆数据可供分析
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-xl border border-zinc-100 overflow-hidden">
      <div className="p-3 bg-zinc-50 border-b border-zinc-100 flex justify-between items-center">
        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">原始位置 (左) → 回忆顺序 (右)</span>
      </div>
      <svg ref={svgRef as any} width={width} height={height}></svg>
      <div className="p-3 text-[9px] text-zinc-500 bg-zinc-50 border-t border-zinc-100 italic">
        提示：悬停在节点上可追踪特定单词的提取路径
      </div>
    </div>
  );
};
