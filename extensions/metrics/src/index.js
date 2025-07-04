import React, { useState, useEffect } from "react";
import { Button, Table, Select, Input, Modal, notification } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";

const { confirm } = Modal;
const { Option } = Select;

const ArgoCDImageUpdater = (props) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [updating, setUpdating] = useState({});
    const [searchTerm, setSearchTerm] = useState("");

    const { application, tree } = props;
    const appName = application?.metadata?.name || "";

    useEffect(() => {
        fetchImageData();
    }, []);

    const fetchImageData = async () => {
        setLoading(true);
        try {
            const historyTags = {};
            const syncResult = application.status.operationState?.syncResult;
            if (syncResult?.resources) {
                syncResult.resources.forEach(res => {
                    if (["Deployment", "StatefulSet"].includes(res.kind) && res.liveState) {
                        try {
                            const live = JSON.parse(res.liveState);
                            live?.spec?.template?.spec?.containers?.forEach(c => {
                                const [imageUrl, imageTag] = c.image.split(":");
                                const key = `${res.kind}/${res.name}`;
                                if (!historyTags[key]) historyTags[key] = {};
                                if (!historyTags[key][imageUrl]) historyTags[key][imageUrl] = new Set();
                                historyTags[key][imageUrl].add(imageTag);
                            });
                        } catch (e) {
                            console.warn("Failed to parse liveState:", e);
                        }
                    }
                });
            }

            const resources = application.status.resources.filter(r => r.kind === "Deployment" || r.kind === "StatefulSet");
            const images = [];

            for (const resource of resources) {
                const name = resource.name;
                const namespace = resource.namespace;
                const kind = resource.kind;
                const group = "apps";
                const version = resource.version;
                const url = `/api/v1/applications/${appName}/resource?name=${name}&appNamespace=argocd&namespace=${namespace}&resourceName=${name}&version=${version}&kind=${kind}&group=${group}`;

                const response = await fetch(url);
                const result = await response.json();
                const manifest = JSON.parse(result.manifest);
                const containers = manifest.spec.template.spec.containers;

                if (containers) {
                    containers.forEach(container => {
                        const [imageUrl, imageTag] = container.image.split(":");
                        const key = `${manifest.kind}/${manifest.metadata.name}`;
                        const tagHistory = historyTags[key]?.[imageUrl] || new Set();
                        tagHistory.add(imageTag);

                        const existing = images.find((img) => img.resource === key);
                        if (existing) {
                            const existingImg = existing.images.find(img => img.imageUrl === imageUrl);
                            if (!existingImg) {
                                existing.images.push({ imageUrl, imageTag, containerName: container.name, history: Array.from(tagHistory) });
                            }
                        } else {
                            images.push({
                                resource: key,
                                images: [{ imageUrl, imageTag, containerName: container.name, history: Array.from(tagHistory) }],
                                selectedImage: imageUrl,
                                newTag: imageTag,
                                metadata: manifest.metadata,
                                apiVersion: manifest.apiVersion,
                                kind: manifest.kind,
                                spec: manifest.spec.template.spec,
                            });
                        }
                    });
                }
            }
            setData(images);
        } catch (error) {
            notification.error({ message: "Failed to fetch image data" });
        }
        setLoading(false);
    };

    const handleUpdate = async (record) => {
        confirm({
            title: "Confirm Update",
            icon: <ExclamationCircleOutlined />,
            content: `Update ${record.selectedImage} to tag ${record.newTag}?`,
            onOk: async () => {
                setUpdating((prev) => ({ ...prev, [record.resource]: true }));
                try {
                    const url = `/api/v1/applications/${appName}/resource?name=${record.metadata.name}&appNamespace=argocd&namespace=${record.metadata.namespace}&resourceName=${record.metadata.name}&version=${record.apiVersion.split("/").pop()}&kind=${record.kind}&group=${record.apiVersion.includes("/") ? record.apiVersion.split("/")[0] : ""}&patchType=application%2Fmerge-patch%2Bjson`;

                    const updatedSpec = JSON.parse(JSON.stringify(record.spec));
                    updatedSpec.containers = updatedSpec.containers.map((container) => {
                        if (container.image.startsWith(record.selectedImage)) {
                            container.image = `${record.selectedImage}:${record.newTag}`;
                        }
                        return container;
                    });

                    const payload = JSON.stringify({ spec: { template: { spec: updatedSpec }} });

                    const response = await fetch(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                    });

                    if (!response.ok) {
                        notification.error({ message: "Failed to update image tag" });
                        throw new Error("Failed to update image tag");
                    }

                    notification.success({ message: "Image tag updated successfully" });

                    setData((prev) => prev.map(item => {
                        if (item.resource === record.resource) {
                            return {
                                ...item,
                                images: item.images.map(img => img.imageUrl === record.selectedImage ? {
                                    ...img,
                                    history: Array.from(new Set([record.newTag, ...img.history, img.imageTag])).slice(0, 5),
                                    imageTag: record.newTag
                                } : img),
                                newTag: record.newTag
                            };
                        }
                        return item;
                    }));
                } catch (error) {
                    notification.error({ message: "Failed to update image tag" });
                }
                setUpdating((prev) => ({ ...prev, [record.resource]: false }));
            },
        });
    };

    const filteredData = data.filter(item => 
        item.resource && item.resource.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const columns = [
        { title: "Resource", dataIndex: "resource", key: "resource" },
        {
            title: "Image URL",
            dataIndex: "selectedImage",
            key: "selectedImage",
            render: (value, record) => (
                <Select value={value} onChange={(val) => {
                    const selectedImg = record.images.find(img => img.imageUrl === val);
                    setData(prev => prev.map(item => item.resource === record.resource ? {
                        ...item,
                        selectedImage: val,
                        newTag: selectedImg?.imageTag || "",
                    } : item));
                }}>
                    {[...new Set(record.images.map(img => img.imageUrl))].map(imgUrl => (
                        <Option key={imgUrl} value={imgUrl}>{imgUrl}</Option>
                    ))}
                </Select>
            ),
        },
        {
            title: "Image Tag",
            dataIndex: "newTag",
            key: "newTag",
            render: (value, record) => {
                const selectedImg = record.images.find(img => img.imageUrl === record.selectedImage);
                const tagOptions = Array.from(new Set([value, ...(selectedImg?.history || [])]));

                return (
                    <div>
                        <Input
                            value={value}
                            onChange={(e) => setData((prev) => prev.map((item) => item.resource === record.resource ? { ...item, newTag: e.target.value } : item))}
                        />
                        <Select style={{ width: '100%', marginTop: 4 }} value={value} onChange={(val) => {
                            setData(prev => prev.map(item => item.resource === record.resource ? { ...item, newTag: val } : item));
                        }}>
                            {tagOptions.map((tag, index) => (
                                <Option key={index} value={tag}>{tag}</Option>
                            ))}
                        </Select>
                    </div>
                );
            },
        },
        {
            title: "Actions",
            key: "actions",
            render: (_, record) => (
                <Button type="primary" loading={updating[record.resource]} onClick={() => handleUpdate(record)}>Update</Button>
            ),
        },
    ];

    return (
        <div>
            <Input
                placeholder="Search by resource name"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ marginBottom: 16 }}
            />
            <Table columns={columns} dataSource={filteredData} loading={loading} rowKey="resource" pagination={{showSizeChanger: true,}} />
        </div>
    );
};

export const component = ArgoCDImageUpdater;

((window) => {
    window.extensionsAPI.registerResourceExtension(
        component,
        "argoproj.io",
        "Application",
        "moreinfo"
    );
})(window);
