import * as Y from 'yjs';
import React from 'react';

const useYDocFromUpdates = (updates?: Uint8Array[]) => {
    const [ydoc] = React.useState(() => new Y.Doc());

    React.useEffect(() => {
        if (!updates) return;

        const updatesArray = Array.isArray(updates) ? updates : [updates];

        if (updatesArray.length === 0) return;

        try {
            updatesArray.forEach((update, i) => {
                Y.applyUpdate(ydoc, new Uint8Array(update));
            });
        } catch (e) {
            console.error('Failed to apply updates:', e);
        }
    }, [updates, ydoc]);

    React.useEffect(() => {
        return () => {
            ydoc.destroy();
        };
    }, [ydoc]);

    return ydoc;
};


export default useYDocFromUpdates;
