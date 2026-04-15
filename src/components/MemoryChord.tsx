import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { TrialResult } from '../constants';

interface MemoryChordProps {
  result: TrialResult;
  width?: number;
  height?: number;
}

export const MemoryChord: React.FC<MemoryChordProps> = ({ result, width = 500, height = 500 }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !result.recallOrder || result.recallOrder.length < 2 || !result.wordCategories) return;

    // Clear previous SVG content
    d3.select(svgRef.current).selectAll("*").remove();

    const outerRadius = Math.min(width, height) * 0.5 - 60;
    const innerRadius = outerRadius - 20;

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

    // 1. Prepare Data
    const categories = Array.from(new Set(result.wordCategories)).filter(Boolean) as string[];
    const categoryToIndex = new Map(categories.map((cat, i) => [cat, i]));
    const n = categories.length;

    if (n < 2) return; // Need at least 2 categories for a chord diagram to be meaningful

    const matrix = Array.from({ length: n }, () => Array(n).fill(0));

    // Fill matrix based on recall transitions
    for (let i = 0; i < result.recallOrder.length - 1; i++) {
      const currentIdx = result.recallOrder[i];
      const nextIdx = result.recallOrder[i + 1];
      const currentCat = result.wordCategories[currentIdx];
      const nextCat = result.wordCategories[nextIdx];

      if (currentCat && nextCat) {
        const row = categoryToIndex.get(currentCat)!;
        const col = categoryToIndex.get(nextCat)!;
        matrix[row][col]++;
      }
    }

    // 2. D3 Chord Setup
    const chord = d3.chord()
      .padAngle(10 / innerRadius)
      .sortSubgroups(d3.descending);

    const arc = d3.arc<d3.ChordGroup>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius);

    const ribbon = d3.ribbon<d3.Chord, d3.ChordSubgroup>()
      .radius(innerRadius);

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [-width / 2, -height / 2, width, height])
      .attr("width", width)
      .attr("height", height)
      .attr("style", "max-width: 100%; height: auto; font: 10px sans-serif;");

    const chords = chord(matrix);

    // Draw Groups (Arcs)
    const group = svg.append("g")
      .selectAll("g")
      .data(chords.groups)
      .join("g");

    group.append("path")
      .attr("fill", d => color(d.index.toString()))
      .attr("stroke", d => d3.rgb(color(d.index.toString())).darker().toString())
      .attr("d", arc as any)
      .style("transition", "opacity 0.2s");

    // Labels
    group.append("text")
      .each(d => { (d as any).angle = (d.startAngle + d.endAngle) / 2; })
      .attr("dy", ".35em")
      .attr("transform", d => `
        rotate(${(d as any).angle * 180 / Math.PI - 90})
        translate(${outerRadius + 10})
        ${(d as any).angle > Math.PI ? "rotate(180)" : ""}
      `)
      .attr("text-anchor", d => (d as any).angle > Math.PI ? "end" : "start")
      .text(d => categories[d.index])
      .attr("font-weight", "bold")
      .attr("fill", "#18181b");

    // Draw Ribbons (Chords)
    const ribbons = svg.append("g")
      .attr("fill-opacity", 0.67)
      .selectAll("path")
      .data(chords)
      .join("path")
      .attr("class", "ribbon")
      .attr("d", ribbon as any)
      .attr("fill", d => color(d.source.index.toString()))
      .attr("stroke", d => d3.rgb(color(d.source.index.toString())).darker().toString())
      .style("mix-blend-mode", "multiply")
      .style("transition", "opacity 0.2s, fill-opacity 0.2s");

    // Interactivity
    group.on("mouseover", function(event, d) {
      ribbons.transition().duration(200)
        .style("opacity", (c: any) => c.source.index === d.index || c.target.index === d.index ? 1 : 0.1);
      
      d3.select(this).select("path").style("opacity", 1);

      // Tooltip
      let content = `<div style="font-weight:bold; margin-bottom:4px;">范畴: ${categories[d.index]}</div>`;
      content += `<div style="color:#a1a1aa;">总转换次数: ${d.value}</div>`;
      
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
      ribbons.transition().duration(200).style("opacity", 1);
      tooltip.style("visibility", "hidden");
    });

    ribbons.on("mouseover", function(event, d) {
      ribbons.transition().duration(200).style("opacity", 0.1);
      d3.select(this).transition().duration(200).style("opacity", 1).style("fill-opacity", 1);

      // Tooltip
      let content = `<div style="font-weight:bold; margin-bottom:4px;">转换详情</div>`;
      content += `<div style="color:#a1a1aa;">${categories[d.source.index]} → ${categories[d.target.index]}</div>`;
      content += `<div style="color:#10b981; margin-top:4px;">次数: ${d.source.value}</div>`;

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
      ribbons.transition().duration(200).style("opacity", 1).style("fill-opacity", 0.67);
      tooltip.style("visibility", "hidden");
    });

    return () => {
      tooltip.remove();
    };
  }, [result, width, height]);

  if (!result.recallOrder || result.recallOrder.length < 2 || !result.wordCategories) {
    return (
      <div className="h-48 flex items-center justify-center text-zinc-400 text-xs font-mono italic text-center p-8">
        需要至少两个范畴单词的回忆数据来生成弦图
      </div>
    );
  }

  const categories = Array.from(new Set(result.wordCategories)).filter(Boolean);
  if (categories.length < 2) {
    return (
      <div className="h-48 flex items-center justify-center text-zinc-400 text-xs font-mono italic text-center p-8">
        当前词表仅包含一个范畴，无法展示范畴间的转换
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-xl border border-zinc-100 overflow-hidden flex flex-col items-center">
      <div className="p-3 bg-zinc-50 border-b border-zinc-100 w-full flex justify-between items-center">
        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">范畴转换弦图 (语义组织可视化)</span>
      </div>
      <div className="p-4">
        <svg ref={svgRef}></svg>
      </div>
      <div className="p-3 text-[9px] text-zinc-500 bg-zinc-50 border-t border-zinc-100 italic w-full">
        提示：内部弦的粗细代表范畴间转换的频率。自指向的弦代表“群集”效应。
      </div>
    </div>
  );
};
