import * as React from "react";
import { useEffect, useState } from 'react';


const MetricItem = ({ title, value }) => {
    const itemStyle = {
        width: "60px",
        flexGrow: 1,
        color: "#495763",
        textAlign: "center",
        margin: "5px",
        padding: "10px",
        border: "1px solid #ccc",
        borderRadius: "5px",
        backgroundColor: "#f9f9f9",
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
    };

    const titleStyle = {
        display: "block",
        fontWeight: "bold",
    };

    const valueStyle = {
        display: "block",
        fontSize: "1.2em",
    };

    return (
        <div style={itemStyle}>
            <span style={titleStyle}>{title}</span>
            <span style={valueStyle}>{value}</span>
        </div>
    );
};

const MetricsDisplay = ({ metrics }) => {
    const containerStyle = {
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-around',
        padding: '10px',
    };

    return (
        <div style={containerStyle}>
            <MetricItem title="Resources" value={metrics.totalResources || 0} />
            <MetricItem title="Pods" value={metrics.totalPods || 0} />
            <MetricItem title="Out-of-Sync" value={metrics.outOfSyncCount || 0} />
        </div>
    );
};

export default MetricsDisplay;

export const MoreInfo = (props) => {
    const [metrics, setMetrics] = useState({
        totalResources: 0,
        totalPods: 0,
        outOfSyncCount: 0,
    });

    const { application, tree } = props;

    const application_name = application?.metadata?.name || "";

    console.log("appname: ", application_name);
    console.log("props: ", props);

    useEffect(() => {
        if (application?.status && tree?.nodes) {
            const totalResources = application.status.resources.length;
            const totalPods = tree.nodes.filter(r => r.kind === 'Pod').length;
            const outOfSyncCount = application.status.resources.filter(r => r.status !== 'Synced').length;

            setMetrics({
                totalResources,
                totalPods,
                outOfSyncCount,
            });
        }
    }, [application, tree]);

    console.log("application: ", application);
    console.log("tree: ", tree);
    console.log("more_info: ", metrics);

    return (
      <MetricsDisplay metrics={metrics} />
    );
};

export const component = MoreInfo;

((window) => {
    window.extensionsAPI.registerResourceExtension(
        component,
        "argoproj.io",
        "Application",
        "moreinfo"
    );
})(window);