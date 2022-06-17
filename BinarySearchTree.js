class Node {
    constructor(value) {
        this.value = value;
        this.left = undefined;
        this.right = undefined;
    }
}

class BinarySearchTree {
    constructor() {
        this.root = undefined;
    }
    
    insert(newNode) {
        if(!this.root) this.root = new Node(newNode);
        else this.insertNewNode(this.root, newNode); 
    }

    insertNewNode(currentNode, newNode) {
        /* If the new node value is less than the current node value, then assign the left of the current node to the new node. */
        if(newNode.value < currentNode.value) {
            if(!currentNode.left) currentNode.left = newNode.value;
            /* This would end the recursive loop since the newNode and current node are the same. */
            return this.insertNewNode(current.left, newNode);
        }

        /* If the new node value is greater than the current node value, then assign the right of the current node to the new node. */
        if(newNode.value > currentNode.value) {
            if(!currentNode.right) currentNode.right = newNode.value;
            /* This would end the recursive loop since the newNode and current ndoe are the same.  */
            return this.insertNewNode(current.right, newNode);
        }
    }

    getMaxNode(node) {
        //If the right node is undefined then recursively loop through the graph until the right property of the node or the greater value is undefined.
        if(!node.right) return node;
        return this.getMaxNode(node.right);
    }

    getMinNode(node) {
        if(!node.left) return node;
        return this.getMinNode(node.left);
    }

    search(node, data) {
        if(node === undefined) return undefined;
        if(node.value < data) return this.search(node.right, data);
        if(node.value > data) return this.search(node.left, data);
        return node;
    }
}

module.exports = { BinarySearchTree };